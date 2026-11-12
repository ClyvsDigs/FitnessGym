<?php

namespace App\Http\Controllers;

use App\Http\Resources\UserResource;
use App\Models\GymSetting;
use App\Models\Trainer;
use App\Models\User;
use App\Rules\PersonName;
use App\Rules\PhoneNumber;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

class SettingController extends Controller
{
    private const STAFF_ROLES = ['admin', 'staff', 'trainer'];

    public function show(): JsonResponse
    {
        return response()->json(['data' => GymSetting::allMap()]);
    }

    public function update(Request $request): JsonResponse
    {
        $request->user()->authorizeAdmin();

        $data = $request->validate([
            'gym_name' => ['sometimes', 'string', 'max:255'],
            'gym_logo' => ['nullable', 'string'],
            'contact_email' => ['nullable', 'email', 'max:255'],
            'contact_phone' => ['nullable', 'string', 'max:30', new PhoneNumber],
            'address' => ['nullable', 'string', 'max:500'],
            'operating_hours' => ['nullable', 'string', 'max:255'],
            'currency' => ['nullable', 'string', 'max:10'],
            'timezone' => ['nullable', 'string', 'max:60'],
        ]);

        foreach ($data as $key => $value) {
            GymSetting::set($key, $value);
        }

        return response()->json([
            'message' => 'Settings saved successfully.',
            'data' => GymSetting::allMap(),
        ]);
    }

    public function users(Request $request): JsonResponse
    {
        $request->user()->authorizeAdmin();

        $users = User::with('trainer')
            ->whereIn('role', self::STAFF_ROLES)
            ->when($request->filled('role') && $request->query('role') !== 'all', fn ($q) => $q->where('role', $request->query('role')))
            ->orderByDesc('created_at')
            ->paginate(min((int) $request->query('per_page', 15), 100));

        return response()->json([
            'data' => UserResource::collection($users->items()),
            'meta' => [
                'current_page' => $users->currentPage(),
                'last_page' => $users->lastPage(),
                'per_page' => $users->perPage(),
                'total' => $users->total(),
            ],
        ]);
    }

    public function storeUser(Request $request): JsonResponse
    {
        $request->user()->authorizeAdmin();

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255', new PersonName],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', Password::min(8)->letters()->numbers()],
            'role' => ['required', 'in:admin,staff,trainer'],
            'phone' => ['nullable', 'string', 'max:30', new PhoneNumber],
            'avatar' => ['nullable', 'image', 'mimes:jpg,jpeg,png', 'max:2048'],
        ]);

        if ($request->hasFile('avatar')) {
            $data['avatar'] = $request->file('avatar')->store('avatars', 'public');
        }

        $user = DB::transaction(function () use ($data) {
            $user = User::create($data);

            // A trainer login account always gets a matching trainer profile so the
            // Trainers page and User Management stay in sync.
            $this->syncTrainerProfile($user);

            return $user;
        });

        return response()->json([
            'message' => 'User created successfully.',
            'data' => new UserResource($user->load('trainer')),
        ], 201);
    }

    public function updateUser(Request $request, User $user): JsonResponse
    {
        $request->user()->authorizeAdmin();

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255', new PersonName],
            'email' => ['sometimes', 'email', 'max:255', 'unique:users,email,' . $user->id],
            'role' => ['sometimes', 'in:admin,staff,trainer'],
            'phone' => ['nullable', 'string', 'max:30', new PhoneNumber],
            'is_active' => ['sometimes', 'boolean'],
            'password' => ['nullable', Password::min(8)->letters()->numbers()],
            'avatar' => ['nullable', 'image', 'mimes:jpg,jpeg,png', 'max:2048'],
        ]);

        if (empty($data['password'])) {
            unset($data['password']);
        }

        if ($request->hasFile('avatar')) {
            if ($user->avatar && Storage::disk('public')->exists($user->avatar)) {
                Storage::disk('public')->delete($user->avatar);
            }
            $data['avatar'] = $request->file('avatar')->store('avatars', 'public');
        }

        $user = DB::transaction(function () use ($user, $data) {
            $user->update($data);

            // Keep the linked trainer profile detail in sync (and create it when a
            // user is promoted to the trainer role).
            $this->syncTrainerProfile($user->fresh());

            return $user;
        });

        return response()->json([
            'message' => 'User updated successfully.',
            'data' => new UserResource($user->fresh()->load('trainer')),
        ]);
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $user = $request->user();

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255', new PersonName],
            'email' => ['sometimes', 'email', 'max:255', 'unique:users,email,' . $user->id],
            'phone' => ['nullable', 'string', 'max:30', new PhoneNumber],
            'avatar' => ['nullable', 'image', 'mimes:jpg,jpeg,png', 'max:2048'],
            'current_password' => ['required_with:password'],
            'password' => ['nullable', 'confirmed', Password::min(8)->letters()->numbers()],
        ]);

        if (! empty($data['password'])) {
            if (! Hash::check($data['current_password'], $user->password)) {
                return response()->json([
                    'message' => 'The current password is incorrect.',
                    'errors' => ['current_password' => ['The current password is incorrect.']],
                ], 422);
            }
            $user->password = $data['password'];
        }

        if ($request->hasFile('avatar')) {
            if ($user->avatar && Storage::disk('public')->exists($user->avatar)) {
                Storage::disk('public')->delete($user->avatar);
            }
            $data['avatar'] = $request->file('avatar')->store('avatars', 'public');
        }

        $user->name = $data['name'] ?? $user->name;
        $user->email = $data['email'] ?? $user->email;
        $user->phone = $data['phone'] ?? $user->phone;
        if (isset($data['avatar'])) {
            $user->avatar = $data['avatar'];
        }
        $user->save();

        $this->syncTrainerProfile($user);

        return response()->json([
            'message' => 'Profile updated successfully.',
            'data' => new UserResource($user->load('trainer')),
        ]);
    }

    /**
     * Keep a trainer login account and its trainer profile linked and in sync.
     * If the account email matches an existing unlinked trainer, that profile is
     * linked instead of creating a duplicate.
     */
    private function syncTrainerProfile(User $user): void
    {
        if ($user->role !== 'trainer') {
            return;
        }

        $trainer = $user->trainer;

        if (! $trainer) {
            $trainer = Trainer::where('email', $user->email)->first();

            if ($trainer && $trainer->user_id && (int) $trainer->user_id !== (int) $user->id) {
                throw ValidationException::withMessages([
                    'email' => ['This email is already linked to another trainer profile.'],
                ]);
            }
        }

        $emailConflict = Trainer::where('email', $user->email)
            ->when($trainer, fn ($q) => $q->whereKeyNot($trainer->id))
            ->exists();

        if ($emailConflict) {
            throw ValidationException::withMessages([
                'email' => ['A trainer profile with this email already exists.'],
            ]);
        }

        [$firstName, $lastName] = $this->splitName($user->name);

        if (! $trainer) {
            Trainer::create([
                'user_id' => $user->id,
                'first_name' => $firstName,
                'last_name' => $lastName,
                'email' => $user->email,
                'phone' => $user->phone,
                'status' => $user->is_active ? 'active' : 'inactive',
            ]);

            return;
        }

        $trainer->update([
            'user_id' => $user->id,
            'first_name' => $firstName,
            'last_name' => $lastName,
            'email' => $user->email,
            'phone' => $user->phone,
        ]);
    }

    private function splitName(string $name): array
    {
        $parts = preg_split('/\s+/', trim($name), 2);

        return [$parts[0] ?? $name, $parts[1] ?? ''];
    }
}
