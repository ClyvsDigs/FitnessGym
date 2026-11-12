<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\AttendanceRecord;
use App\Models\Member;
use App\Models\Membership;
use App\Models\MembershipPlan;
use App\Models\Payment;
use App\Models\Trainer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ApiTest extends TestCase
{
    use RefreshDatabase;

    private function createAdmin(): User
    {
        return User::factory()->create(['role' => 'admin']);
    }

    private function createMemberUser(): User
    {
        return User::factory()->create(['role' => 'member']);
    }

    public function test_admin_can_login_and_receive_token(): void
    {
        $user = $this->createAdmin();

        $response = $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'password',
        ]);

        $response->assertOk()->assertJsonStructure(['token', 'user']);
    }

    public function test_login_rejects_invalid_credentials(): void
    {
        $user = $this->createAdmin();

        $response = $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'wrong-password',
        ]);

        $response->assertStatus(422);
    }

    public function test_unauthenticated_user_cannot_access_protected_routes(): void
    {
        $this->getJson('/api/members')->assertUnauthorized();
        $this->getJson('/api/dashboard/summary')->assertUnauthorized();
    }

    public function test_member_role_cannot_access_admin_api(): void
    {
        $user = $this->createMemberUser();

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/members')
            ->assertForbidden();

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/settings')
            ->assertForbidden();
    }

    public function test_admin_can_list_and_create_members(): void
    {
        $admin = $this->createAdmin();
        $plan = MembershipPlan::create([
            'name' => 'Monthly',
            'type' => 'monthly',
            'duration_days' => 30,
            'price' => 1000,
            'status' => 'active',
        ]);

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/members')
            ->assertOk()
            ->assertJsonStructure(['data', 'meta']);

        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/members', [
            'first_name' => 'John',
            'last_name' => 'Doe',
            'email' => 'john@example.com',
            'phone' => '+63 917 000 0000',
            'plan_id' => $plan->id,
            'membership_start_date' => now()->toDateString(),
        ]);

        $response->assertCreated();

        $this->assertDatabaseHas('members', ['email' => 'john@example.com', 'status' => 'active']);
        $this->assertDatabaseHas('memberships', ['member_id' => Member::where('email', 'john@example.com')->first()->id, 'status' => 'active']);
    }

    public function test_member_search_and_filter(): void
    {
        $admin = $this->createAdmin();

        Member::create(['member_code' => 'GYM-0001', 'first_name' => 'Alpha', 'last_name' => 'One', 'email' => 'alpha@test.com', 'status' => 'active']);
        Member::create(['member_code' => 'GYM-0002', 'first_name' => 'Beta', 'last_name' => 'Two', 'email' => 'beta@test.com', 'status' => 'suspended']);

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/members?search=Alpha')
            ->assertOk()
            ->assertJsonCount(1, 'data');

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/members?status=suspended')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_member_pagination_meta(): void
    {
        $admin = $this->createAdmin();

        Member::factory()->count(25)->create();

        $response = $this->actingAs($admin, 'sanctum')->getJson('/api/members?per_page=10');

        $response->assertOk()
            ->assertJsonCount(10, 'data')
            ->assertJsonPath('meta.total', 25)
            ->assertJsonPath('meta.per_page', 10)
            ->assertJsonPath('meta.last_page', 3);
    }

    public function test_admin_can_manage_plans(): void
    {
        $admin = $this->createAdmin();

        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/plans', [
            'name' => 'Annual',
            'type' => 'annual',
            'duration_days' => 365,
            'price' => 10000,
            'status' => 'active',
        ]);

        $response->assertCreated();

        $plan = MembershipPlan::first();
        $this->actingAs($admin, 'sanctum')
            ->putJson("/api/plans/{$plan->id}", ['name' => 'Annual Elite', 'type' => 'annual', 'duration_days' => 365, 'price' => 12000])
            ->assertOk()
            ->assertJsonPath('data.name', 'Annual Elite');
    }

    public function test_admin_can_record_payment_and_revenue_reflects(): void
    {
        $admin = $this->createAdmin();
        $member = Member::create(['member_code' => 'GYM-P01', 'first_name' => 'Pay', 'last_name' => 'Ment', 'email' => 'pay@test.com', 'status' => 'active']);

        $this->actingAs($admin, 'sanctum')->postJson('/api/payments', [
            'member_id' => $member->id,
            'amount' => 1500,
            'payment_method' => 'cash',
            'status' => 'paid',
        ])->assertCreated();

        $this->assertDatabaseHas('payments', ['member_id' => $member->id, 'status' => 'paid']);

        $summary = $this->actingAs($admin, 'sanctum')->getJson('/api/dashboard/summary');
        $summary->assertOk();
        $this->assertEquals(1500.0, (float) $summary->json('monthly_revenue'));
    }

    public function test_attendance_check_in_and_duplicate_prevention(): void
    {
        $admin = $this->createAdmin();
        $plan = MembershipPlan::create(['name' => 'Attendance Plan', 'type' => 'monthly', 'duration_days' => 30, 'price' => 100, 'status' => 'active']);
        $member = Member::create(['member_code' => 'GYM-A01', 'first_name' => 'Att', 'last_name' => 'Endance', 'email' => 'att@test.com', 'status' => 'active']);
        \App\Models\Membership::create([
            'member_id' => $member->id,
            'membership_plan_id' => $plan->id,
            'start_date' => now()->toDateString(),
            'end_date' => now()->addMonth()->toDateString(),
            'amount' => 100,
            'status' => 'active',
        ]);

        $this->actingAs($admin, 'sanctum')->postJson('/api/attendance/check-in', ['member_id' => $member->id])
            ->assertCreated();

        $this->actingAs($admin, 'sanctum')->postJson('/api/attendance/check-in', ['member_id' => $member->id])
            ->assertStatus(422);

        $this->actingAs($admin, 'sanctum')->postJson('/api/attendance/check-out', ['member_id' => $member->id])
            ->assertOk();

        // A member cannot check out twice, or check out without an active check-in.
        $this->actingAs($admin, 'sanctum')->postJson('/api/attendance/check-out', ['member_id' => $member->id])
            ->assertStatus(422);

        $other = Member::create(['member_code' => 'GYM-A02', 'first_name' => 'No', 'last_name' => 'Checkin', 'email' => 'nocheckin@test.com', 'status' => 'active']);
        \App\Models\Membership::create([
            'member_id' => $other->id,
            'membership_plan_id' => $plan->id,
            'start_date' => now()->toDateString(),
            'end_date' => now()->addMonth()->toDateString(),
            'amount' => 100,
            'status' => 'active',
        ]);

        $this->actingAs($admin, 'sanctum')->postJson('/api/attendance/check-out', ['member_id' => $other->id])
            ->assertStatus(422);
    }

    public function test_dashboard_summary_returns_all_stats(): void
    {
        $admin = $this->createAdmin();

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/dashboard/summary')
            ->assertOk()
            ->assertJsonStructure([
                'total_members',
                'total_members_change',
                'today_check_ins',
                'today_check_ins_change',
                'monthly_revenue',
                'monthly_revenue_change',
                'expiring_soon',
            ]);
    }

    public function test_revenue_chart_range_returns_series(): void
    {
        $admin = $this->createAdmin();

        $response = $this->actingAs($admin, 'sanctum')->getJson('/api/dashboard/revenue?range=6m');
        $response->assertOk()->assertJsonStructure(['data']);

        $this->assertCount(6, $response->json('data'));
    }

    public function test_admin_can_manage_trainers(): void
    {
        $admin = $this->createAdmin();

        $this->actingAs($admin, 'sanctum')->postJson('/api/trainers', [
            'first_name' => 'New',
            'last_name' => 'Trainer',
            'email' => 'newtrainer@test.com',
            'specialization' => 'Cardio',
        ])->assertCreated();

        $trainer = Trainer::first();
        $this->actingAs($admin, 'sanctum')
            ->putJson("/api/trainers/{$trainer->id}", ['first_name' => 'Updated', 'last_name' => 'Trainer', 'email' => 'newtrainer@test.com', 'status' => 'inactive'])
            ->assertOk()
            ->assertJsonPath('data.status', 'inactive');
    }

    public function test_settings_persist(): void
    {
        $admin = $this->createAdmin();

        $this->actingAs($admin, 'sanctum')->putJson('/api/settings', [
            'gym_name' => 'Test Gym',
            'currency' => 'PHP',
        ])->assertOk();

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/settings')
            ->assertOk()
            ->assertJsonPath('data.gym_name', 'Test Gym');
    }

    public function test_member_cannot_delete_member_with_active_membership(): void
    {
        $admin = $this->createAdmin();
        $plan = MembershipPlan::create(['name' => 'M', 'type' => 'monthly', 'duration_days' => 30, 'price' => 100, 'status' => 'active']);
        $member = Member::create(['member_code' => 'GYM-D01', 'first_name' => 'Del', 'last_name' => 'Ete', 'email' => 'del@test.com', 'status' => 'active']);

        \App\Models\Membership::create([
            'member_id' => $member->id,
            'membership_plan_id' => $plan->id,
            'start_date' => now()->toDateString(),
            'end_date' => now()->addMonth()->toDateString(),
            'amount' => 100,
            'status' => 'active',
        ]);

        $this->actingAs($admin, 'sanctum')
            ->deleteJson("/api/members/{$member->id}")
            ->assertStatus(422);

        $this->assertDatabaseHas('members', ['id' => $member->id, 'deleted_at' => null]);
    }

    public function test_suspended_member_with_active_membership_can_be_deleted(): void
    {
        $admin = $this->createAdmin();
        $plan = MembershipPlan::create(['name' => 'S', 'type' => 'monthly', 'duration_days' => 30, 'price' => 100, 'status' => 'active']);
        $member = Member::create(['member_code' => 'GYM-S01', 'first_name' => 'Sus', 'last_name' => 'Pended', 'email' => 'sus@test.com', 'status' => 'suspended']);

        \App\Models\Membership::create([
            'member_id' => $member->id,
            'membership_plan_id' => $plan->id,
            'start_date' => now()->toDateString(),
            'end_date' => now()->addMonth()->toDateString(),
            'amount' => 100,
            'status' => 'active',
        ]);

        $this->actingAs($admin, 'sanctum')
            ->deleteJson("/api/members/{$member->id}")
            ->assertOk();

        $this->assertSoftDeleted('members', ['id' => $member->id]);
        $this->assertDatabaseHas('memberships', ['member_id' => $member->id, 'status' => 'cancelled']);
    }

    public function test_user_management_only_manages_staff_roles(): void
    {
        $admin = $this->createAdmin();

        $this->actingAs($admin, 'sanctum')->postJson('/api/settings/users', [
            'name' => 'Portal Person',
            'email' => 'portal@test.com',
            'password' => 'password123',
            'role' => 'member',
        ])->assertStatus(422)->assertJsonValidationErrors(['role']);

        $this->actingAs($admin, 'sanctum')->postJson('/api/settings/users', [
            'name' => 'New Trainer',
            'email' => 'trainer.user@test.com',
            'password' => 'password123',
            'role' => 'trainer',
        ])->assertCreated()->assertJsonPath('data.role', 'trainer');

        $response = $this->actingAs($admin, 'sanctum')->getJson('/api/settings/users');
        $response->assertOk();
        $roles = collect($response->json('data'))->pluck('role')->unique()->values()->all();
        $this->assertNotContains('member', $roles);
    }

    public function test_email_of_soft_deleted_member_can_be_reused(): void
    {
        $admin = $this->createAdmin();

        $this->actingAs($admin, 'sanctum')->postJson('/api/members', [
            'first_name' => 'First',
            'last_name' => 'Person',
            'email' => 'reuse@test.com',
            'status' => 'pending',
        ])->assertCreated();

        $first = Member::where('email', 'reuse@test.com')->first();
        $this->actingAs($admin, 'sanctum')->deleteJson("/api/members/{$first->id}")->assertOk();

        $this->actingAs($admin, 'sanctum')->postJson('/api/members', [
            'first_name' => 'Second',
            'last_name' => 'Person',
            'email' => 'reuse@test.com',
            'status' => 'pending',
        ])->assertCreated();

        $this->assertSame(1, Member::where('email', 'reuse@test.com')->count());
        $this->assertSame(1, Member::onlyTrashed()->where('email', 'reuse@test.com')->count());
    }

    public function test_phone_numbers_reject_letters(): void
    {
        $admin = $this->createAdmin();

        $this->actingAs($admin, 'sanctum')->postJson('/api/members', [
            'first_name' => 'Bad',
            'last_name' => 'Phone',
            'email' => 'badphone@test.com',
            'phone' => 'abc123',
            'status' => 'pending',
        ])->assertStatus(422)->assertJsonValidationErrors(['phone']);

        $this->actingAs($admin, 'sanctum')->postJson('/api/members', [
            'first_name' => 'Good',
            'last_name' => 'Phone',
            'email' => 'goodphone@test.com',
            'phone' => '+63 917 123 4567',
            'emergency_contact_phone' => '0917-123-4567',
            'status' => 'pending',
        ])->assertCreated();

        $this->actingAs($admin, 'sanctum')->postJson('/api/members', [
            'first_name' => 'Bad',
            'last_name' => 'Emergency',
            'email' => 'bademergency@test.com',
            'emergency_contact_phone' => 'call me',
            'status' => 'pending',
        ])->assertStatus(422)->assertJsonValidationErrors(['emergency_contact_phone']);
    }

    public function test_reports_endpoints_return_summary(): void
    {
        $admin = $this->createAdmin();

        $this->actingAs($admin, 'sanctum')->getJson('/api/reports/members')
            ->assertOk()
            ->assertJsonStructure(['summary', 'plan_distribution', 'rows']);

        $this->actingAs($admin, 'sanctum')->getJson('/api/reports/payments')
            ->assertOk()
            ->assertJsonStructure(['summary', 'monthly', 'rows']);

        $this->actingAs($admin, 'sanctum')->getJson('/api/reports/attendance')
            ->assertOk()
            ->assertJsonStructure(['summary', 'daily', 'rows']);
    }

    public function test_member_can_access_portal_endpoints(): void
    {
        $user = $this->createMemberUser();
        $plan = MembershipPlan::create(['name' => 'Gold', 'type' => 'monthly', 'duration_days' => 30, 'price' => 500, 'status' => 'active']);
        $member = Member::create([
            'user_id' => $user->id,
            'member_code' => 'GYM-P01',
            'first_name' => 'Por',
            'last_name' => 'Tal',
            'email' => $user->email,
            'status' => 'active',
        ]);
        $membership = \App\Models\Membership::create([
            'member_id' => $member->id,
            'membership_plan_id' => $plan->id,
            'start_date' => now()->toDateString(),
            'end_date' => now()->addMonth()->toDateString(),
            'amount' => 500,
            'status' => 'active',
        ]);
        Payment::create([
            'payment_number' => 'PAY-P01',
            'member_id' => $member->id,
            'membership_id' => $membership->id,
            'membership_plan_id' => $plan->id,
            'amount' => 500,
            'payment_method' => 'cash',
            'status' => 'paid',
            'paid_at' => now(),
        ]);
        \App\Models\AttendanceRecord::create([
            'member_id' => $member->id,
            'date' => now()->toDateString(),
            'check_in' => now(),
            'status' => 'present',
        ]);

        $this->actingAs($user, 'sanctum')->getJson('/api/portal/profile')
            ->assertOk()
            ->assertJsonPath('data.member_code', 'GYM-P01');

        $this->actingAs($user, 'sanctum')->getJson('/api/portal/memberships')
            ->assertOk()
            ->assertJsonStructure(['data']);

        $this->actingAs($user, 'sanctum')->getJson('/api/portal/payments')
            ->assertOk()
            ->assertJsonStructure(['data', 'meta']);

        $this->actingAs($user, 'sanctum')->getJson('/api/portal/attendance')
            ->assertOk()
            ->assertJsonStructure(['data', 'meta']);
    }

    public function test_admin_cannot_access_member_portal(): void
    {
        $admin = $this->createAdmin();

        $this->actingAs($admin, 'sanctum')->getJson('/api/portal/profile')
            ->assertForbidden();
    }

    public function test_register_creates_member_record_and_portal_works(): void
    {
        $response = $this->postJson('/api/register', [
            'name' => 'New Member',
            'email' => 'newmember@test.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'phone' => '09171234567',
        ]);

        $response->assertCreated()->assertJsonStructure(['token', 'user']);

        $user = User::where('email', 'newmember@test.com')->first();
        $this->assertNotNull($user->member);
        $this->assertSame('New', $user->member->first_name);
        $this->assertSame('Member', $user->member->last_name);

        $this->actingAs($user, 'sanctum')->getJson('/api/portal/profile')
            ->assertOk()
            ->assertJsonPath('data.email', 'newmember@test.com');
    }

    public function test_member_can_update_own_profile(): void
    {
        $user = $this->createMemberUser();
        Member::create([
            'user_id' => $user->id,
            'member_code' => 'GYM-U01',
            'first_name' => 'Old',
            'last_name' => 'Name',
            'email' => $user->email,
            'status' => 'active',
        ]);

        $this->actingAs($user, 'sanctum')->putJson('/api/portal/profile', [
            'first_name' => 'Updated',
            'last_name' => 'Profile',
            'phone' => '09999999999',
            'address' => '123 Test St',
            'gender' => 'male',
            'date_of_birth' => '1995-06-15',
            'emergency_contact_name' => 'Jane Doe',
            'emergency_contact_phone' => '09111111111',
        ])
            ->assertOk()
            ->assertJsonPath('data.first_name', 'Updated')
            ->assertJsonPath('data.last_name', 'Profile')
            ->assertJsonPath('data.address', '123 Test St');

        $this->assertSame('Updated Profile', $user->fresh()->name);
        $this->assertDatabaseHas('members', ['id' => $user->member->id, 'gender' => 'male', 'address' => '123 Test St']);
    }

    public function test_names_reject_digits(): void
    {
        $admin = $this->createAdmin();

        $this->actingAs($admin, 'sanctum')->postJson('/api/members', [
            'first_name' => 'John123',
            'last_name' => 'Doe',
            'email' => 'digitname@test.com',
            'status' => 'pending',
        ])->assertStatus(422)->assertJsonValidationErrors(['first_name']);

        $this->actingAs($admin, 'sanctum')->postJson('/api/trainers', [
            'first_name' => 'Trainer',
            'last_name' => '42',
            'email' => 'digittrainer@test.com',
        ])->assertStatus(422)->assertJsonValidationErrors(['last_name']);
    }

    public function test_payment_amount_must_be_positive(): void
    {
        $admin = $this->createAdmin();
        $member = Member::create(['member_code' => 'GYM-V01', 'first_name' => 'Val', 'last_name' => 'Idate', 'email' => 'val@test.com', 'status' => 'active']);

        foreach ([0, -100] as $amount) {
            $this->actingAs($admin, 'sanctum')->postJson('/api/payments', [
                'member_id' => $member->id,
                'amount' => $amount,
                'payment_method' => 'cash',
                'status' => 'paid',
            ])->assertStatus(422)->assertJsonValidationErrors(['amount']);
        }

        $this->assertSame(0, Payment::count());
    }

    public function test_payment_reference_must_be_unique(): void
    {
        $admin = $this->createAdmin();
        $member = Member::create(['member_code' => 'GYM-R01', 'first_name' => 'Ref', 'last_name' => 'Dupe', 'email' => 'ref@test.com', 'status' => 'active']);

        $payload = [
            'member_id' => $member->id,
            'amount' => 500,
            'payment_method' => 'cash',
            'status' => 'paid',
            'reference_number' => 'TXN-UNIQUE-1',
        ];

        $this->actingAs($admin, 'sanctum')->postJson('/api/payments', $payload)->assertCreated();

        $this->actingAs($admin, 'sanctum')->postJson('/api/payments', $payload)
            ->assertStatus(422)
            ->assertJsonValidationErrors(['reference_number']);

        $this->assertSame(1, Payment::where('reference_number', 'TXN-UNIQUE-1')->count());
    }

    public function test_archived_plan_cannot_be_assigned_or_charged(): void
    {
        $admin = $this->createAdmin();
        $plan = MembershipPlan::create(['name' => 'Archived Plan', 'type' => 'monthly', 'duration_days' => 30, 'price' => 500, 'status' => 'archived']);
        $member = Member::create(['member_code' => 'GYM-AP1', 'first_name' => 'Arch', 'last_name' => 'Plan', 'email' => 'arch@test.com', 'status' => 'pending']);

        $this->actingAs($admin, 'sanctum')->postJson('/api/members', [
            'first_name' => 'New',
            'last_name' => 'Member',
            'email' => 'archmember@test.com',
            'plan_id' => $plan->id,
            'membership_start_date' => now()->toDateString(),
            'status' => 'pending',
        ])->assertStatus(422)->assertJsonValidationErrors(['plan_id']);

        $this->actingAs($admin, 'sanctum')->postJson('/api/payments', [
            'member_id' => $member->id,
            'membership_plan_id' => $plan->id,
            'amount' => 500,
            'payment_method' => 'cash',
            'status' => 'paid',
            'create_membership' => true,
            'membership_start_date' => now()->toDateString(),
        ])->assertStatus(422)->assertJsonValidationErrors(['membership_plan_id']);

        $this->assertDatabaseCount('memberships', 0);
    }

    public function test_payment_amount_must_cover_plan_price_when_creating_membership(): void
    {
        $admin = $this->createAdmin();
        $plan = MembershipPlan::create(['name' => 'Premium', 'type' => 'monthly', 'duration_days' => 30, 'price' => 1500, 'status' => 'active']);
        $member = Member::create(['member_code' => 'GYM-PP1', 'first_name' => 'Low', 'last_name' => 'Amount', 'email' => 'lowamount@test.com', 'status' => 'pending']);

        $this->actingAs($admin, 'sanctum')->postJson('/api/payments', [
            'member_id' => $member->id,
            'membership_plan_id' => $plan->id,
            'amount' => 500,
            'payment_method' => 'cash',
            'status' => 'paid',
            'create_membership' => true,
            'membership_start_date' => now()->toDateString(),
        ])->assertStatus(422)->assertJsonValidationErrors(['amount']);

        $this->assertDatabaseCount('memberships', 0);
    }

    public function test_attendance_blocks_ineligible_members(): void
    {
        Storage::fake('public');
        $admin = $this->createAdmin();
        $plan = MembershipPlan::create(['name' => 'Att Plan', 'type' => 'monthly', 'duration_days' => 30, 'price' => 100, 'status' => 'active']);

        $expired = Member::create(['member_code' => 'GYM-EX1', 'first_name' => 'Ex', 'last_name' => 'Pired', 'email' => 'expired@test.com', 'status' => 'expired']);
        Membership::create([
            'member_id' => $expired->id,
            'membership_plan_id' => $plan->id,
            'start_date' => now()->subMonths(2)->toDateString(),
            'end_date' => now()->subMonth()->toDateString(),
            'amount' => 100,
            'status' => 'expired',
        ]);

        $suspended = Member::create(['member_code' => 'GYM-SU1', 'first_name' => 'Sus', 'last_name' => 'Pended', 'email' => 'suspended@test.com', 'status' => 'suspended']);

        $noMembership = Member::create(['member_code' => 'GYM-NM1', 'first_name' => 'No', 'last_name' => 'Membership', 'email' => 'nomembership@test.com', 'status' => 'active']);

        $this->actingAs($admin, 'sanctum')->postJson('/api/attendance/check-in', ['member_id' => $expired->id])->assertStatus(422);
        $this->actingAs($admin, 'sanctum')->postJson('/api/attendance/check-in', ['member_id' => $suspended->id])->assertStatus(422);
        $this->actingAs($admin, 'sanctum')->postJson('/api/attendance/check-in', ['member_id' => $noMembership->id])->assertStatus(422);

        $this->assertDatabaseCount('attendance_records', 0);
    }

    public function test_appointment_prevents_past_and_conflicting_bookings(): void
    {
        $admin = $this->createAdmin();
        $member = Member::create(['member_code' => 'GYM-AP2', 'first_name' => 'App', 'last_name' => 'Oint', 'email' => 'appt@test.com', 'status' => 'active']);
        $otherMember = Member::create(['member_code' => 'GYM-AP3', 'first_name' => 'Other', 'last_name' => 'Member', 'email' => 'appt2@test.com', 'status' => 'active']);
        $trainer = Trainer::create(['first_name' => 'Coach', 'last_name' => 'One', 'email' => 'coach@test.com', 'status' => 'active']);

        $this->actingAs($admin, 'sanctum')->postJson('/api/appointments', [
            'member_id' => $member->id,
            'trainer_id' => $trainer->id,
            'title' => 'Past Session',
            'scheduled_at' => now()->subDay()->toDateTimeString(),
            'duration_minutes' => 60,
        ])->assertStatus(422)->assertJsonValidationErrors(['scheduled_at']);

        $start = now()->addDays(2)->setTime(9, 0);
        $this->actingAs($admin, 'sanctum')->postJson('/api/appointments', [
            'member_id' => $member->id,
            'trainer_id' => $trainer->id,
            'title' => 'First Session',
            'scheduled_at' => $start->toDateTimeString(),
            'duration_minutes' => 60,
        ])->assertCreated();

        // Same trainer, overlapping time for another member.
        $this->actingAs($admin, 'sanctum')->postJson('/api/appointments', [
            'member_id' => $otherMember->id,
            'trainer_id' => $trainer->id,
            'title' => 'Trainer Clash',
            'scheduled_at' => $start->copy()->addMinutes(30)->toDateTimeString(),
            'duration_minutes' => 60,
        ])->assertStatus(422)->assertJsonValidationErrors(['scheduled_at']);

        // Same member, overlapping time with a different trainer.
        $trainer2 = Trainer::create(['first_name' => 'Coach', 'last_name' => 'Two', 'email' => 'coach2@test.com', 'status' => 'active']);
        $this->actingAs($admin, 'sanctum')->postJson('/api/appointments', [
            'member_id' => $member->id,
            'trainer_id' => $trainer2->id,
            'title' => 'Member Clash',
            'scheduled_at' => $start->copy()->addMinutes(30)->toDateTimeString(),
            'duration_minutes' => 60,
        ])->assertStatus(422)->assertJsonValidationErrors(['scheduled_at']);

        // Cancelled appointments do not block the slot.
        Appointment::where('title', 'First Session')->update(['status' => 'cancelled']);
        $this->actingAs($admin, 'sanctum')->postJson('/api/appointments', [
            'member_id' => $otherMember->id,
            'trainer_id' => $trainer->id,
            'title' => 'Replacement',
            'scheduled_at' => $start->toDateTimeString(),
            'duration_minutes' => 60,
        ])->assertCreated();
    }

    public function test_appointment_duration_limits_and_inactive_trainer(): void
    {
        $admin = $this->createAdmin();
        $member = Member::create(['member_code' => 'GYM-AP4', 'first_name' => 'Dur', 'last_name' => 'Ation', 'email' => 'duration@test.com', 'status' => 'active']);
        $inactive = Trainer::create(['first_name' => 'Old', 'last_name' => 'Coach', 'email' => 'oldcoach@test.com', 'status' => 'inactive']);

        foreach ([4, 481] as $duration) {
            $this->actingAs($admin, 'sanctum')->postJson('/api/appointments', [
                'member_id' => $member->id,
                'title' => 'Duration Test',
                'scheduled_at' => now()->addDay()->toDateTimeString(),
                'duration_minutes' => $duration,
            ])->assertStatus(422)->assertJsonValidationErrors(['duration_minutes']);
        }

        $this->actingAs($admin, 'sanctum')->postJson('/api/appointments', [
            'member_id' => $member->id,
            'trainer_id' => $inactive->id,
            'title' => 'Inactive Trainer',
            'scheduled_at' => now()->addDay()->toDateTimeString(),
            'duration_minutes' => 60,
        ])->assertStatus(422)->assertJsonValidationErrors(['trainer_id']);
    }

    public function test_photo_upload_rejects_invalid_files(): void
    {
        Storage::fake('public');
        $admin = $this->createAdmin();

        $this->actingAs($admin, 'sanctum')->post('/api/members', [
            'first_name' => 'Photo',
            'last_name' => 'Fail',
            'email' => 'photofail@test.com',
            'status' => 'pending',
            'photo' => UploadedFile::fake()->create('document.pdf', 100, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertStatus(422)->assertJsonValidationErrors(['photo']);

        $this->actingAs($admin, 'sanctum')->post('/api/members', [
            'first_name' => 'Photo',
            'last_name' => 'Ok',
            'email' => 'photoopk@test.com',
            'status' => 'pending',
            'photo' => UploadedFile::fake()->image('avatar.png', 100, 100),
        ], ['Accept' => 'application/json'])->assertCreated();

        Storage::disk('public')->assertExists(Member::where('email', 'photoopk@test.com')->first()->photo);
    }

    public function test_reports_reject_invalid_date_ranges(): void
    {
        $admin = $this->createAdmin();

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/reports/payments?from=2026-05-10&to=2026-05-01')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['to']);

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/reports/attendance?from=not-a-date')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['from']);
    }

    public function test_revenue_excludes_refunded_and_unpaid_payments(): void
    {
        $admin = $this->createAdmin();
        $member = Member::create(['member_code' => 'GYM-RE1', 'first_name' => 'Rev', 'last_name' => 'Enue', 'email' => 'revenue@test.com', 'status' => 'active']);

        foreach ([['paid', 1000], ['refunded', 500], ['pending', 300], ['failed', 200]] as [$status, $amount]) {
            Payment::create([
                'payment_number' => 'PAY-' . strtoupper($status),
                'member_id' => $member->id,
                'amount' => $amount,
                'payment_method' => 'cash',
                'status' => $status,
                'paid_at' => $status === 'paid' ? now() : null,
            ]);
        }

        $response = $this->actingAs($admin, 'sanctum')->getJson('/api/reports/payments');
        $response->assertOk();
        $this->assertEquals(1000.0, (float) $response->json('summary.total_revenue'));
        $this->assertSame(1, $response->json('summary.paid_count'));
        $this->assertSame(1, $response->json('summary.refunded_count'));
    }

    public function test_trainer_photo_upload_and_update_persists(): void
    {
        Storage::fake('public');
        $admin = $this->createAdmin();

        $this->actingAs($admin, 'sanctum')->post('/api/trainers', [
            'first_name' => 'Coach',
            'last_name' => 'Photo',
            'email' => 'coach.photo@test.com',
            'specialization' => 'Strength',
            'status' => 'active',
            'photo' => UploadedFile::fake()->image('coach.jpg', 120, 120),
        ], ['Accept' => 'application/json'])->assertCreated();

        $trainer = Trainer::where('email', 'coach.photo@test.com')->firstOrFail();
        $this->assertNotNull($trainer->photo);
        Storage::disk('public')->assertExists($trainer->photo);
        $oldPhoto = $trainer->photo;

        $this->actingAs($admin, 'sanctum')->post("/api/trainers/{$trainer->id}", [
            'first_name' => 'Coach',
            'last_name' => 'Updated',
            'email' => 'coach.photo@test.com',
            'status' => 'active',
            'photo' => UploadedFile::fake()->image('coach2.png', 120, 120),
        ], ['Accept' => 'application/json'])->assertOk();

        $trainer->refresh();
        $this->assertSame('Updated', $trainer->last_name);
        $this->assertNotSame($oldPhoto, $trainer->photo);
        Storage::disk('public')->assertExists($trainer->photo);
        Storage::disk('public')->assertMissing($oldPhoto);
    }

    public function test_member_photo_can_be_uploaded_through_multipart_update_route(): void
    {
        Storage::fake('public');
        $admin = $this->createAdmin();
        $member = Member::create([
            'member_code' => 'GYM-PH1',
            'first_name' => 'Photo',
            'last_name' => 'Update',
            'email' => 'photo.update@test.com',
            'status' => 'pending',
        ]);

        $this->actingAs($admin, 'sanctum')->post("/api/members/{$member->id}", [
            'first_name' => 'Photo',
            'last_name' => 'Updated',
            'email' => 'photo.update@test.com',
            'status' => 'pending',
            'photo' => UploadedFile::fake()->image('member.png', 120, 120),
        ], ['Accept' => 'application/json'])->assertOk();

        $member->refresh();
        $this->assertSame('Updated', $member->last_name);
        $this->assertNotNull($member->photo);
        Storage::disk('public')->assertExists($member->photo);
    }

    public function test_admin_can_upload_profile_avatar(): void
    {
        Storage::fake('public');
        $admin = $this->createAdmin();

        $this->actingAs($admin, 'sanctum')->post('/api/profile', [
            'name' => $admin->name,
            'email' => $admin->email,
            'avatar' => UploadedFile::fake()->image('me.png', 64, 64),
        ], ['Accept' => 'application/json'])->assertOk();

        $admin->refresh();
        $this->assertNotNull($admin->avatar);
        Storage::disk('public')->assertExists($admin->avatar);
    }

    public function test_admin_can_upload_staff_avatar(): void
    {
        Storage::fake('public');
        $admin = $this->createAdmin();
        $staff = User::factory()->create(['role' => 'staff']);

        $this->actingAs($admin, 'sanctum')->post("/api/settings/users/{$staff->id}", [
            'name' => $staff->name,
            'email' => $staff->email,
            'role' => 'staff',
            'avatar' => UploadedFile::fake()->image('staff.png', 64, 64),
        ], ['Accept' => 'application/json'])->assertOk();

        $staff->refresh();
        $this->assertNotNull($staff->avatar);
        Storage::disk('public')->assertExists($staff->avatar);
    }

    public function test_reports_return_rows_for_members_and_attendance(): void
    {
        $admin = $this->createAdmin();
        $member = Member::create([
            'member_code' => 'GYM-RP1',
            'first_name' => 'Report',
            'last_name' => 'Row',
            'email' => 'report.row@test.com',
            'status' => 'active',
        ]);

        AttendanceRecord::create([
            'member_id' => $member->id,
            'date' => now()->toDateString(),
            'check_in' => now()->subHour(),
            'check_out' => now(),
            'status' => 'present',
        ]);

        $members = $this->actingAs($admin, 'sanctum')->getJson('/api/reports/members')->assertOk();
        $this->assertNotEmpty($members->json('rows'));
        $this->assertSame('GYM-RP1', $members->json('rows.0.member_code'));

        $attendance = $this->actingAs($admin, 'sanctum')->getJson('/api/reports/attendance')->assertOk();
        $this->assertNotEmpty($attendance->json('rows'));
        $this->assertSame(1, $attendance->json('summary.total_check_ins'));

        $payments = $this->actingAs($admin, 'sanctum')->getJson('/api/reports/payments')->assertOk();
        $this->assertIsArray($payments->json('rows'));
    }

    public function test_login_is_rate_limited_after_repeated_failures(): void
    {
        $user = $this->createAdmin();

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->postJson('/api/login', [
                'email' => $user->email,
                'password' => 'wrong-password',
            ])->assertStatus(422);
        }

        $blocked = $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'password',
        ]);

        $blocked->assertStatus(422)->assertJsonValidationErrors(['email']);
        $this->assertStringContainsString('Too many login attempts', $blocked->json('errors.email.0'));
    }

    public function test_register_rejects_duplicate_email_and_weak_password(): void
    {
        $existing = $this->createAdmin();

        $this->postJson('/api/register', [
            'name' => 'Duplicate Account',
            'email' => $existing->email,
            'password' => 'Password123',
            'password_confirmation' => 'Password123',
        ])->assertStatus(422)->assertJsonValidationErrors(['email']);

        $this->postJson('/api/register', [
            'name' => 'Weak Password',
            'email' => 'weak.password@test.com',
            'password' => 'passwordonly',
            'password_confirmation' => 'passwordonly',
        ])->assertStatus(422)->assertJsonValidationErrors(['password']);

        $this->postJson('/api/register', [
            'name' => 'No Confirmation',
            'email' => 'no.confirmation@test.com',
            'password' => 'Password123',
        ])->assertStatus(422)->assertJsonValidationErrors(['password']);
    }

    public function test_creating_and_updating_a_trainer_user_syncs_the_trainer_profile(): void
    {
        $admin = $this->createAdmin();

        $this->actingAs($admin, 'sanctum')->postJson('/api/settings/users', [
            'name' => 'Coach Login',
            'email' => 'coach.login@test.com',
            'password' => 'password123',
            'role' => 'trainer',
            'phone' => '09171234567',
        ])->assertCreated()
            ->assertJsonPath('data.role', 'trainer')
            ->assertJsonPath('data.trainer.first_name', 'Coach')
            ->assertJsonPath('data.trainer.last_name', 'Login');

        $user = User::where('email', 'coach.login@test.com')->firstOrFail();
        $trainer = Trainer::where('user_id', $user->id)->firstOrFail();
        $this->assertSame('Coach Login', $trainer->full_name);

        $this->actingAs($admin, 'sanctum')->post("/api/settings/users/{$user->id}", [
            'name' => 'Coach Renamed',
            'email' => 'coach.renamed@test.com',
            'phone' => '09179876543',
            'role' => 'trainer',
            'is_active' => '1',
        ], ['Accept' => 'application/json'])->assertOk();

        $trainer->refresh();
        $this->assertSame('Coach Renamed', $trainer->full_name);
        $this->assertSame('coach.renamed@test.com', $trainer->email);
        $this->assertSame('09179876543', $trainer->phone);
    }

    public function test_creating_a_trainer_with_a_login_account_creates_a_user_management_entry(): void
    {
        Storage::fake('public');
        $admin = $this->createAdmin();

        $this->actingAs($admin, 'sanctum')->post('/api/trainers', [
            'first_name' => 'Missing',
            'last_name' => 'Password',
            'email' => 'missing.password@test.com',
            'status' => 'active',
            'create_account' => '1',
        ], ['Accept' => 'application/json'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['password']);

        $this->actingAs($admin, 'sanctum')->post('/api/trainers', [
            'first_name' => 'Login',
            'last_name' => 'Trainer',
            'email' => 'login.trainer@test.com',
            'phone' => '09171234567',
            'status' => 'active',
            'create_account' => '1',
            'password' => 'password123',
        ], ['Accept' => 'application/json'])
            ->assertCreated()
            ->assertJsonPath('data.has_login', true)
            ->assertJsonPath('data.user_id', User::where('email', 'login.trainer@test.com')->value('id'));

        $this->assertDatabaseHas('users', [
            'email' => 'login.trainer@test.com',
            'role' => 'trainer',
            'is_active' => true,
        ]);

        $this->postJson('/api/login', [
            'email' => 'login.trainer@test.com',
            'password' => 'password123',
        ])->assertOk()->assertJsonPath('user.role', 'trainer');

        $trainer = Trainer::where('email', 'login.trainer@test.com')->firstOrFail();
        $this->actingAs($admin, 'sanctum')->post("/api/trainers/{$trainer->id}", [
            'first_name' => 'Login',
            'last_name' => 'Trainer',
            'email' => 'login.trainer@test.com',
            'status' => 'active',
            'create_account' => '0',
            'password' => 'newpassword123',
        ], ['Accept' => 'application/json'])->assertOk();

        $this->postJson('/api/login', [
            'email' => 'login.trainer@test.com',
            'password' => 'newpassword123',
        ])->assertOk()->assertJsonPath('user.role', 'trainer');
    }

    public function test_trainer_is_hidden_from_trainers_when_login_role_is_not_trainer(): void
    {
        $admin = $this->createAdmin();

        $this->actingAs($admin, 'sanctum')->postJson('/api/settings/users', [
            'name' => 'Promoted Trainer',
            'email' => 'promoted.trainer@test.com',
            'password' => 'password123',
            'role' => 'trainer',
        ])->assertCreated();

        $user = User::where('email', 'promoted.trainer@test.com')->firstOrFail();
        $trainer = Trainer::where('user_id', $user->id)->firstOrFail();

        $this->actingAs($admin, 'sanctum')->getJson('/api/trainers')
            ->assertOk()
            ->assertJsonFragment(['email' => 'promoted.trainer@test.com']);

        $this->actingAs($admin, 'sanctum')->putJson("/api/settings/users/{$user->id}", [
            'name' => 'Promoted Trainer',
            'email' => 'promoted.trainer@test.com',
            'role' => 'admin',
        ])->assertOk()->assertJsonPath('data.role', 'admin');

        // The profile is kept for data integrity but leaves the Trainers feature.
        $this->assertDatabaseHas('trainers', ['id' => $trainer->id, 'user_id' => $user->id]);
        $this->assertDatabaseHas('users', ['id' => $user->id, 'role' => 'admin']);

        $this->actingAs($admin, 'sanctum')->getJson('/api/trainers')
            ->assertOk()
            ->assertJsonMissing(['email' => 'promoted.trainer@test.com']);

        // Switching the account back to trainer restores the profile.
        $this->actingAs($admin, 'sanctum')->putJson("/api/settings/users/{$user->id}", [
            'name' => 'Promoted Trainer',
            'email' => 'promoted.trainer@test.com',
            'role' => 'trainer',
        ])->assertOk();

        $this->actingAs($admin, 'sanctum')->getJson('/api/trainers')
            ->assertOk()
            ->assertJsonFragment(['email' => 'promoted.trainer@test.com']);
    }

    public function test_staff_and_trainer_can_upload_their_own_profile_avatar(): void
    {
        Storage::fake('public');

        foreach (['staff', 'trainer'] as $role) {
            $user = User::factory()->create(['role' => $role]);

            $this->actingAs($user, 'sanctum')->post('/api/profile', [
                'name' => $user->name,
                'email' => $user->email,
                'avatar' => UploadedFile::fake()->image("{$role}.png", 64, 64),
            ], ['Accept' => 'application/json'])->assertOk();

            $user->refresh();
            $this->assertNotNull($user->avatar);
            Storage::disk('public')->assertExists($user->avatar);
        }
    }

    public function test_reports_include_older_records_when_no_dates_are_selected(): void
    {
        $admin = $this->createAdmin();
        $oldDate = now()->subYear();

        $member = Member::create([
            'member_code' => 'GYM-OLD1',
            'first_name' => 'Old',
            'last_name' => 'Record',
            'email' => 'old.record@test.com',
            'status' => 'active',
        ]);
        $member->created_at = $oldDate;
        $member->save();

        $payment = Payment::create([
            'payment_number' => 'PAY-OLD1',
            'member_id' => $member->id,
            'amount' => 750,
            'payment_method' => 'cash',
            'status' => 'paid',
            'paid_at' => $oldDate,
        ]);
        $payment->created_at = $oldDate;
        $payment->save();

        AttendanceRecord::create([
            'member_id' => $member->id,
            'date' => $oldDate->toDateString(),
            'check_in' => $oldDate->copy()->setTime(8, 0),
            'check_out' => $oldDate->copy()->setTime(9, 0),
            'status' => 'present',
        ]);

        $members = $this->actingAs($admin, 'sanctum')->getJson('/api/reports/members')->assertOk();
        $this->assertNotEmpty($members->json('rows'));

        $payments = $this->actingAs($admin, 'sanctum')->getJson('/api/reports/payments')->assertOk();
        $this->assertEquals(750.0, (float) $payments->json('summary.total_revenue'));
        $this->assertNotEmpty($payments->json('rows'));

        $attendance = $this->actingAs($admin, 'sanctum')->getJson('/api/reports/attendance')->assertOk();
        $this->assertSame(1, $attendance->json('summary.total_check_ins'));
        $this->assertNotEmpty($attendance->json('rows'));
    }
}
