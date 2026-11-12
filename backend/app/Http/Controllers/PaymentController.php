<?php

namespace App\Http\Controllers;

use App\Http\Requests\PaymentRequest;
use App\Http\Resources\PaymentResource;
use App\Models\Member;
use App\Models\Membership;
use App\Models\MembershipPlan;
use App\Models\Payment;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PaymentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $payments = Payment::with(['member', 'plan'])
            ->when($request->filled('search'), function ($q) use ($request) {
                $search = $request->query('search');
                $q->where(function ($sub) use ($search) {
                    $sub->where('payment_number', 'like', "%{$search}%")
                        ->orWhere('reference_number', 'like', "%{$search}%")
                        ->orWhereHas('member', fn ($m) => $m->where('first_name', 'like', "%{$search}%")
                            ->orWhere('last_name', 'like', "%{$search}%")
                            ->orWhere('email', 'like', "%{$search}%"));
                });
            })
            ->when($request->filled('status') && $request->query('status') !== 'all', fn ($q) => $q->where('status', $request->query('status')))
            ->when($request->filled('method') && $request->query('method') !== 'all', fn ($q) => $q->where('payment_method', $request->query('method')))
            ->when($request->filled('from'), fn ($q) => $q->whereDate('created_at', '>=', $request->query('from')))
            ->when($request->filled('to'), fn ($q) => $q->whereDate('created_at', '<=', $request->query('to')))
            ->when($request->filled('member_id'), fn ($q) => $q->where('member_id', $request->query('member_id')))
            ->latest()
            ->paginate(min((int) $request->query('per_page', 10), 100));

        return response()->json([
            'data' => PaymentResource::collection($payments->items()),
            'meta' => [
                'current_page' => $payments->currentPage(),
                'last_page' => $payments->lastPage(),
                'per_page' => $payments->perPage(),
                'total' => $payments->total(),
            ],
        ]);
    }

    public function store(PaymentRequest $request): JsonResponse
    {
        $data = $request->validated();
        $status = $data['status'] ?? 'pending';
        $data['reference_number'] = $this->normalizeReference($data['reference_number'] ?? null);

        $payment = DB::transaction(function () use ($request, $data, $status) {
            $payment = Payment::create([
                'payment_number' => $this->generatePaymentNumber(),
                'member_id' => $data['member_id'],
                'membership_plan_id' => $data['membership_plan_id'] ?? null,
                'amount' => $data['amount'],
                'payment_method' => $data['payment_method'],
                'status' => $status,
                'reference_number' => $data['reference_number'] ?? null,
                'notes' => $data['notes'] ?? null,
                'paid_at' => $status === 'paid'
                    ? ($data['paid_at'] ?? now())
                    : ($data['paid_at'] ?? null),
                'recorded_by' => $request->user()->id,
            ]);

            if (! empty($data['create_membership']) && ! empty($data['membership_plan_id'])) {
                $plan = MembershipPlan::findOrFail($data['membership_plan_id']);

                if ($plan->status !== 'active') {
                    abort(422, 'Archived plans cannot be assigned to a membership.');
                }

                $start = Carbon::parse($data['membership_start_date']);
                $end = isset($data['membership_end_date'])
                    ? Carbon::parse($data['membership_end_date'])
                    : $start->copy()->addDays($plan->duration_days);

                // Close the previous active membership before starting a new one so periods do not overlap.
                Membership::where('member_id', $data['member_id'])
                    ->where('status', 'active')
                    ->update(['status' => 'expired']);

                $membership = Membership::create([
                    'member_id' => $data['member_id'],
                    'membership_plan_id' => $plan->id,
                    'start_date' => $start->toDateString(),
                    'end_date' => $end->toDateString(),
                    'amount' => $plan->price,
                    'status' => 'active',
                    'created_by' => $request->user()->id,
                ]);

                $payment->update(['membership_id' => $membership->id]);
                Member::whereKey($data['member_id'])->update(['status' => 'active']);
            }

            return $payment;
        });

        return response()->json([
            'message' => 'Payment recorded successfully.',
            'data' => new PaymentResource($payment->load(['member', 'plan'])),
        ], 201);
    }

    public function show(Payment $payment): JsonResponse
    {
        return response()->json([
            'data' => new PaymentResource($payment->load(['member', 'plan', 'membership.plan'])),
        ]);
    }

    public function update(PaymentRequest $request, Payment $payment): JsonResponse
    {
        $data = $request->validated();

        // A payment's owner and the membership-creation flags cannot be changed after the fact.
        unset(
            $data['member_id'],
            $data['create_membership'],
            $data['membership_start_date'],
            $data['membership_end_date'],
        );

        if (array_key_exists('reference_number', $data)) {
            $data['reference_number'] = $this->normalizeReference($data['reference_number']);
        }

        $payment->update($data);

        if (($data['status'] ?? null) === 'paid' && ! $payment->paid_at) {
            $payment->update(['paid_at' => $data['paid_at'] ?? now()]);
        }

        return response()->json([
            'message' => 'Payment updated successfully.',
            'data' => new PaymentResource($payment->fresh()->load(['member', 'plan'])),
        ]);
    }

    private function normalizeReference(?string $reference): ?string
    {
        $reference = $reference !== null ? trim($reference) : null;

        return $reference === '' ? null : $reference;
    }

    private function generatePaymentNumber(): string
    {
        do {
            $number = 'PAY-' . now()->format('Ymd') . '-' . str_pad((string) (Payment::max('id') + 1), 5, '0', STR_PAD_LEFT);
        } while (Payment::where('payment_number', $number)->exists());

        return $number;
    }
}
