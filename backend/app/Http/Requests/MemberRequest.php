<?php

namespace App\Http\Requests;

use App\Rules\PersonName;
use App\Rules\PhoneNumber;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class MemberRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isManagement() ?? false;
    }

    public function rules(): array
    {
        $memberId = $this->route('member')?->id ?? $this->route('member');

        return [
            'first_name' => ['required', 'string', 'max:100', new PersonName],
            'last_name' => ['required', 'string', 'max:100', new PersonName],
            'email' => [
                'required', 'string', 'email', 'max:255',
                Rule::unique('members', 'email')
                    ->ignore($memberId)
                    ->whereNull('deleted_at'),
            ],
            'phone' => ['nullable', 'string', 'max:30', new PhoneNumber],
            'address' => ['nullable', 'string', 'max:255'],
            'date_of_birth' => ['nullable', 'date', 'before_or_equal:today'],
            'gender' => ['nullable', 'in:male,female,other'],
            'emergency_contact_name' => ['nullable', 'string', 'max:255', new PersonName],
            'emergency_contact_phone' => ['nullable', 'string', 'max:30', new PhoneNumber],
            'photo' => ['nullable', 'image', 'mimes:jpg,jpeg,png', 'max:2048'],
            'status' => ['sometimes', 'in:active,pending,expired,suspended'],
            'plan_id' => [
                'nullable',
                Rule::exists('membership_plans', 'id')->where('status', 'active'),
            ],
            'membership_start_date' => ['nullable', 'date', 'required_with:plan_id'],
            'membership_end_date' => ['nullable', 'date', 'after_or_equal:membership_start_date'],
        ];
    }

    public function messages(): array
    {
        return [
            'plan_id.exists' => 'The selected membership plan does not exist or is archived.',
            'membership_start_date.required_with' => 'A membership start date is required when assigning a plan.',
            'membership_end_date.after_or_equal' => 'The membership end date cannot be earlier than the start date.',
        ];
    }
}
