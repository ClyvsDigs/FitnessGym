<?php

namespace App\Http\Requests;

use App\Models\MembershipPlan;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class PaymentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isManagement() ?? false;
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('reference_number') && is_string($this->input('reference_number'))) {
            $reference = trim($this->input('reference_number'));
            $this->merge(['reference_number' => $reference === '' ? null : $reference]);
        }
    }

    public function rules(): array
    {
        $paymentId = $this->route('payment')?->id ?? $this->route('payment');

        return [
            'member_id' => ['required', 'exists:members,id'],
            'membership_plan_id' => [
                'nullable',
                Rule::exists('membership_plans', 'id')->where('status', 'active'),
            ],
            'amount' => ['required', 'numeric', 'gt:0', 'max:99999999'],
            'payment_method' => ['required', 'in:cash,card,bank_transfer,e_wallet'],
            'status' => ['sometimes', 'in:pending,paid,failed,refunded'],
            'reference_number' => [
                'nullable', 'string', 'max:255',
                Rule::unique('payments', 'reference_number')
                    ->ignore($paymentId)
                    ->whereNotNull('reference_number'),
            ],
            'notes' => ['nullable', 'string', 'max:2000'],
            'paid_at' => ['nullable', 'date', 'before_or_equal:now'],
            'create_membership' => ['sometimes', 'boolean'],
            'membership_start_date' => ['nullable', 'date', 'required_if:create_membership,true'],
            'membership_end_date' => ['nullable', 'date', 'after_or_equal:membership_start_date'],
        ];
    }

    public function messages(): array
    {
        return [
            'amount.gt' => 'The payment amount must be greater than zero.',
            'reference_number.unique' => 'This transaction reference has already been used.',
            'membership_plan_id.exists' => 'The selected plan does not exist or is archived.',
            'membership_start_date.required_if' => 'A membership start date is required when creating a membership.',
            'membership_end_date.after_or_equal' => 'The membership end date cannot be earlier than the start date.',
            'paid_at.before_or_equal' => 'The payment date cannot be in the future.',
        ];
    }

    /**
     * Verify the amount covers the plan price when a membership is created.
     */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            if (! $this->boolean('create_membership') || ! $this->filled('membership_plan_id')) {
                return;
            }

            $plan = MembershipPlan::find($this->input('membership_plan_id'));

            if (! $plan) {
                return;
            }

            if ((float) $this->input('amount') < (float) $plan->price) {
                $validator->errors()->add(
                    'amount',
                    "The payment amount must be at least the plan price ({$plan->price})."
                );
            }
        });
    }
}
