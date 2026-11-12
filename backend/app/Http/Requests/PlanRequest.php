<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class PlanRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isManagement() ?? false;
    }

    public function rules(): array
    {
        $planId = $this->route('plan')?->id ?? $this->route('plan');

        return [
            'name' => [
                'required', 'string', 'max:255',
                Rule::unique('membership_plans', 'name')->ignore($planId),
            ],
            'description' => ['nullable', 'string', 'max:2000'],
            'type' => ['required', 'in:weekly,monthly,quarterly,annual'],
            'duration_days' => ['required', 'integer', 'min:1', 'max:3650'],
            'price' => ['required', 'numeric', 'min:0', 'max:99999999'],
            'benefits' => ['nullable', 'array', 'max:50'],
            'benefits.*' => ['string', 'max:255'],
            'status' => ['sometimes', 'in:active,archived'],
        ];
    }

    public function messages(): array
    {
        return [
            'name.unique' => 'A membership plan with this name already exists.',
            'duration_days.min' => 'A membership plan must last at least one day.',
        ];
    }
}
