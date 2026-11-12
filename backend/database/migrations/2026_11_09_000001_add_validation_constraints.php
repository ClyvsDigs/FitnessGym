<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Database-level guards for the core validation rules.
     * CHECK constraints are only added on drivers that support them (MySQL/MariaDB).
     */
    public function up(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->unique('reference_number');
        });

        if ($this->supportsCheckConstraints()) {
            $this->statement('ALTER TABLE membership_plans ADD CONSTRAINT chk_plans_price CHECK (price >= 0)');
            $this->statement('ALTER TABLE membership_plans ADD CONSTRAINT chk_plans_duration CHECK (duration_days >= 1)');
            $this->statement('ALTER TABLE memberships ADD CONSTRAINT chk_memberships_amount CHECK (amount >= 0)');
            $this->statement('ALTER TABLE memberships ADD CONSTRAINT chk_memberships_dates CHECK (end_date >= start_date)');
            $this->statement('ALTER TABLE payments ADD CONSTRAINT chk_payments_amount CHECK (amount > 0)');
            $this->statement('ALTER TABLE attendance_records ADD CONSTRAINT chk_attendance_times CHECK (check_out IS NULL OR check_in IS NULL OR check_out >= check_in)');
            $this->statement('ALTER TABLE appointments ADD CONSTRAINT chk_appointments_duration CHECK (duration_minutes BETWEEN 5 AND 480)');
        }
    }

    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->dropUnique(['reference_number']);
        });

        if ($this->supportsCheckConstraints()) {
            foreach ([
                'membership_plans' => ['chk_plans_price', 'chk_plans_duration'],
                'memberships' => ['chk_memberships_amount', 'chk_memberships_dates'],
                'payments' => ['chk_payments_amount'],
                'attendance_records' => ['chk_attendance_times'],
                'appointments' => ['chk_appointments_duration'],
            ] as $table => $constraints) {
                foreach ($constraints as $constraint) {
                    $this->statement("ALTER TABLE {$table} DROP CONSTRAINT {$constraint}");
                }
            }
        }
    }

    private function supportsCheckConstraints(): bool
    {
        return in_array(DB::getDriverName(), ['mysql', 'pgsql'], true);
    }

    private function statement(string $sql): void
    {
        try {
            DB::statement($sql);
        } catch (\Throwable $e) {
            // Constraint may already exist on repeat runs; keep the migration idempotent.
        }
    }
};
