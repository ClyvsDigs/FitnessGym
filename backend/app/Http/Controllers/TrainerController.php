<?php

namespace App\Http\Controllers;

use App\Http\Requests\TrainerRequest;
use App\Http\Resources\TrainerResource;
use App\Models\Trainer;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class TrainerController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $trainers = Trainer::with('user')->withCount('appointments')
            // A profile only belongs in the Trainers feature while its login
            // account keeps the trainer role. If that account is promoted to
            // admin/staff (or changed to member), the profile is kept for data
            // integrity but hidden here.
            ->where(function ($q) {
                $q->whereNull('user_id')
                    ->orWhereHas('user', fn ($sub) => $sub->where('role', 'trainer'));
            })
            ->when($request->filled('search'), function ($q) use ($request) {
                $search = $request->query('search');
                $q->where(function ($sub) use ($search) {
                    $sub->where('first_name', 'like', "%{$search}%")
                        ->orWhere('last_name', 'like', "%{$search}%")
                        ->orWhere('email', 'like', "%{$search}%")
                        ->orWhere('specialization', 'like', "%{$search}%");
                });
            })
            ->when($request->filled('status') && $request->query('status') !== 'all', fn ($q) => $q->where('status', $request->query('status')))
            ->latest()
            ->paginate(min((int) $request->query('per_page', 10), 100));

        return response()->json([
            'data' => TrainerResource::collection($trainers->items()),
            'meta' => [
                'current_page' => $trainers->currentPage(),
                'last_page' => $trainers->lastPage(),
                'per_page' => $trainers->perPage(),
                'total' => $trainers->total(),
            ],
        ]);
    }

    public function store(TrainerRequest $request): JsonResponse
    {
        $data = $request->validated();
        $createAccount = (bool) ($data['create_account'] ?? false);
        $password = $data['password'] ?? null;
        unset($data['create_account'], $data['password']);

        if ($createAccount && User::where('email', $data['email'])->exists()) {
            throw ValidationException::withMessages([
                'email' => ['A user account with this email already exists.'],
            ]);
        }

        if ($request->hasFile('photo')) {
            $data['photo'] = $request->file('photo')->store('trainers', 'public');
        }

        $trainer = DB::transaction(function () use ($data, $createAccount, $password) {
            $trainer = Trainer::create($data);

            if ($createAccount && $password) {
                $user = User::create([
                    'name' => trim($data['first_name'] . ' ' . $data['last_name']),
                    'email' => $data['email'],
                    'password' => $password,
                    'phone' => $data['phone'] ?? null,
                    'role' => 'trainer',
                    'is_active' => ($data['status'] ?? 'active') === 'active',
                ]);

                $trainer->update(['user_id' => $user->id]);
            }

            return $trainer;
        });

        return response()->json([
            'message' => 'Trainer created successfully.',
            'data' => new TrainerResource($trainer->fresh()->load('user')),
        ], 201);
    }

    public function show(Trainer $trainer): JsonResponse
    {
        $trainer->load('user')->loadCount('appointments');

        return response()->json(['data' => new TrainerResource($trainer)]);
    }

    public function update(TrainerRequest $request, Trainer $trainer): JsonResponse
    {
        $data = $request->validated();
        $createAccount = (bool) ($data['create_account'] ?? false);
        $password = $data['password'] ?? null;
        unset($data['create_account'], $data['password']);

        if ($request->hasFile('photo')) {
            if ($trainer->photo && Storage::disk('public')->exists($trainer->photo)) {
                Storage::disk('public')->delete($trainer->photo);
            }
            $data['photo'] = $request->file('photo')->store('trainers', 'public');
        }

        DB::transaction(function () use ($trainer, $data, $createAccount, $password) {
            $trainer->update($data);
            $trainer->refresh();

            $this->syncLoginAccount($trainer, $createAccount, $password);
        });

        return response()->json([
            'message' => 'Trainer updated successfully.',
            'data' => new TrainerResource($trainer->fresh()->load('user')),
        ]);
    }

    /**
     * Create or update the trainer's login account. This mirrors the account
     * details managed from User Management.
     */
    private function syncLoginAccount(Trainer $trainer, bool $createAccount, ?string $password): void
    {
        $account = $trainer->user;

        if (! $account && ! $createAccount && ! $password) {
            return;
        }

        $emailOwner = User::where('email', $trainer->email)
            ->when($account, fn ($q) => $q->whereKeyNot($account->id))
            ->first();

        if ($emailOwner) {
            throw ValidationException::withMessages([
                'email' => ['A user account with this email already exists.'],
            ]);
        }

        $name = trim($trainer->first_name . ' ' . $trainer->last_name);

        if ($account) {
            $account->fill([
                'name' => $name,
                'email' => $trainer->email,
                'phone' => $trainer->phone,
            ]);

            if ($password) {
                $account->password = $password;
            }

            $account->save();

            return;
        }

        $user = User::create([
            'name' => $name,
            'email' => $trainer->email,
            'password' => $password,
            'phone' => $trainer->phone,
            'role' => 'trainer',
            'is_active' => $trainer->status === 'active',
        ]);

        $trainer->update(['user_id' => $user->id]);
    }

    public function destroy(Trainer $trainer): JsonResponse
    {
        if ($trainer->appointments()->where('status', 'scheduled')->exists()) {
            $trainer->update(['status' => 'inactive']);

            return response()->json([
                'message' => 'Trainer has upcoming appointments and was deactivated instead of deleted.',
                'data' => new TrainerResource($trainer),
            ]);
        }

        $trainer->delete();

        return response()->json(['message' => 'Trainer deleted successfully.']);
    }
}
