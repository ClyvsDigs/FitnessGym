<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Validates Philippine mobile numbers.
 *
 * Accepted formats (separators such as spaces, dashes, dots and parentheses are ignored):
 *   - Local:          09XXXXXXXXX  (11 digits)
 *   - International:  +639XXXXXXXXX / 639XXXXXXXXX (12 digits)
 */
class PhoneNumber implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if ($value === null || $value === '') {
            return;
        }

        $raw = trim((string) $value);

        if (! preg_match('/^\+?[0-9\s\-().]+$/', $raw)) {
            $fail('The :attribute may only contain numbers and phone symbols (+, -, (, ), space).');

            return;
        }

        $digits = preg_replace('/\D+/', '', $raw);

        $isLocal = (bool) preg_match('/^09\d{9}$/', $digits);
        $isInternational = (bool) preg_match('/^639\d{9}$/', $digits);

        if (! $isLocal && ! $isInternational) {
            $fail('The :attribute must be a valid Philippine mobile number (11 digits starting with 09, e.g. 09171234567).');
        }
    }
}
