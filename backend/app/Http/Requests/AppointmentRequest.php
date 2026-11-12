<?php

namespace App\Http\Requests;

use App\Models\Appointment;
use Carbon\Carbon;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class AppointmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isManagement() ?? false;
    }

    public function rules(): array
    {
        return [
            'member_id' => ['required', 'exists:members,id'],
            'trainer_id' => [
                'nullable',
                Rule::exists('trainers', 'id')->where('status', 'active'),
            ],
            'title' => ['required', 'string', 'max:255'],
            'type' => ['nullable', 'string', 'max:100'],
            'scheduled_at' => ['required', 'date'],
            'duration_minutes' => ['required', 'integer', 'min:5', 'max:480'],
            'status' => ['sometimes', 'in:scheduled,completed,cancelled'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }

    public function messages(): array
    {
        return [
            'trainer_id.exists' => 'The selected trainer does not exist or is inactive.',
            'duration_minutes.min' => 'An appointment must last at least 5 minutes.',
            'duration_minutes.max' => 'An appointment cannot last longer than 480 minutes.',
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            if ($validator->errors()->isNotEmpty()) {
                return;
            }

            /** @var Appointment|null $current */
            $current = $this->route('appointment');
            $start = Carbon::parse($this->input('scheduled_at'));
            $duration = (int) $this->input('duration_minutes');
            $end = $start->copy()->addMinutes($duration);

            // Prevent booking in the past (allow existing appointments to keep their original time).
            $isNewBooking = ! $current;
            $isRescheduled = $current && $current->scheduled_at &&
                ! $current->scheduled_at->equalTo($start);

            if (($isNewBooking || $isRescheduled) && $start->lt(now())) {
                $validator->errors()->add('scheduled_at', 'Appointments cannot be booked in the past.');

                return;
            }

            // Only scheduled/completed appointments block a slot; cancelled ones do not.
            $base = Appointment::query()
                ->where('status', '!=', 'cancelled')
                ->when($current, fn ($q) => $q->whereKeyNot($current->id));

            $windowStart = $start->copy()->subMinutes(480);
            $windowEnd = $end->copy()->addMinutes(480);

            if ($this->filled('trainer_id')) {
                $conflict = $this->findConflict(
                    $base->clone()
                        ->where('trainer_id', $this->input('trainer_id'))
                        ->whereBetween('scheduled_at', [$windowStart, $windowEnd])
                        ->get(),
                    $start,
                    $end
                );

                if ($conflict) {
                    $validator->errors()->add(
                        'scheduled_at',
                        'This trainer already has an appointment that overlaps with the selected time.'
                    );
                }
            }

            $memberConflict = $this->findConflict(
                $base->clone()
                    ->where('member_id', $this->input('member_id'))
                    ->whereBetween('scheduled_at', [$windowStart, $windowEnd])
                    ->get(),
                $start,
                $end
            );

            if ($memberConflict) {
                $validator->errors()->add(
                    'scheduled_at',
                    'This member already has an overlapping appointment.'
                );
            }
        });
    }

    private function findConflict($appointments, Carbon $start, Carbon $end): ?Appointment
    {
        foreach ($appointments as $appointment) {
            $otherStart = $appointment->scheduled_at;
            if (! $otherStart) {
                continue;
            }

            $otherEnd = $otherStart->copy()->addMinutes((int) $appointment->duration_minutes);

            if ($otherStart->lt($end) && $otherEnd->gt($start)) {
                return $appointment;
            }
        }

        return null;
    }
}
