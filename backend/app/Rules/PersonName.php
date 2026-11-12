<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Ensures a name contains only letters and common name punctuation.
 */
class PersonName implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if ($value === null || $value === '') {
            return;
        }

        if (! preg_match("/^[\pL][\pL\s.'-]*$/u", (string) $value)) {
            $fail('The :attribute may only contain letters, spaces, hyphens, apostrophes, and periods.');
        }
    }
}
