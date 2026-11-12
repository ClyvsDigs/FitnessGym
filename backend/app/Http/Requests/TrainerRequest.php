<?php

namespace App\Http\Requests;

use App\Rules\PersonName;
use App\Rules\PhoneNumber;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

class TrainerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isManagement() ?? false;
    }

    public function rules(): array
    {
        $trainerId = $this->route('trainer')?->id ?? $this->route('trainer');

        return [
            'first_name' => ['required', 'string', 'max:100', new PersonName],
            'last_name' => ['required', 'string', 'max:100', new PersonName],
            'email' => [
                'required', 'string', 'email', 'max:255',
                Rule::unique('trainers', 'email')->ignore($trainerId),
            ],
            'phone' => ['nullable', 'string', 'max:30', new PhoneNumber],
            'specialization' => ['nullable', 'string', 'max:255'],
            'availability' => ['nullable', 'string', 'max:255'],
            'bio' => ['nullable', 'string', 'max:2000'],
            'photo' => ['nullable', 'image', 'mimes:jpg,jpeg,png', 'max:2048'],
            'status' => ['sometimes', 'in:active,inactive'],
            'create_account' => ['sometimes', 'boolean'],
            'password' => ['nullable', 'required_if:create_account,1', Password::min(8)->letters()->numbers()],
        ];
    }
}
