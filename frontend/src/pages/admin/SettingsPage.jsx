import { Building2, Lock, Save, UserCog, UserRound } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import PhotoUploader from '@/components/common/PhotoUploader'
import { useAuth } from '@/context/AuthContext'
import LoadingSpinner from '@/components/common/LoadingSpinner'
import Modal from '@/components/common/Modal'
import { TableSkeleton } from '@/components/common/Skeleton'
import StatusBadge from '@/components/common/StatusBadge'
import PageHeader from '@/components/layout/PageHeader'
import { settingsService } from '@/services'
import { getErrorMessage } from '@/services/api'
import { formatDate, getInitials, sanitizePhone } from '@/utils/format'
import { isValidEmail, isValidName, isValidPassword, isValidPhone } from '@/utils/validation'

const tabs = [
  { id: 'profile', label: 'My Profile', icon: UserRound },
  { id: 'gym', label: 'Gym Settings', icon: Building2 },
  { id: 'users', label: 'User Management', icon: UserCog },
]

function backendErrors(error) {
  const errors = error?.response?.data?.errors
  if (!errors) return null
  return Object.fromEntries(Object.entries(errors).map(([key, value]) => [key, [].concat(value)[0]]))
}

export default function SettingsPage() {
  const { user: authUser } = useAuth()
  const [tab, setTab] = useState('profile')
  const isAdmin = authUser?.role === 'admin'
  const visibleTabs = isAdmin ? tabs : tabs.filter((t) => t.id === 'profile')

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle={isAdmin ? 'Manage your account, gym details, and staff users.' : 'Update your profile photo, details, and password.'}
      />
      <div className="card overflow-hidden">
        <div className="flex overflow-x-auto border-b border-border-color">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-5 py-3.5 text-sm font-medium transition-colors ${
                tab === t.id ? 'border-primary text-primary' : 'border-transparent text-secondary-text hover:text-main-text'
              }`}
            >
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>
        <div className="p-6">
          {tab === 'profile' ? (
            <ProfileTab user={authUser} />
          ) : tab === 'gym' ? (
            <GymTab />
          ) : (
            <UsersTab />
          )}
        </div>
      </div>
    </div>
  )
}

function ProfileTab({ user }) {
  const { refreshUser } = useAuth()
  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
  })
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar_url || '')
  const [errors, setErrors] = useState({})
  const [passwords, setPasswords] = useState({ current_password: '', password: '', password_confirmation: '' })
  const [passwordErrors, setPasswordErrors] = useState({})
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  const validateProfile = () => {
    const next = {}
    if (!form.name.trim()) next.name = 'Name is required.'
    else if (!isValidName(form.name)) next.name = 'Use letters, spaces, hyphens, apostrophes or periods only.'
    if (!form.email.trim()) next.email = 'Email is required.'
    else if (!isValidEmail(form.email)) next.email = 'Enter a valid email address.'
    if (form.phone && !isValidPhone(form.phone)) next.phone = 'Enter a valid PH mobile number (e.g. 09171234567).'
    return next
  }

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev))
  }

  const submitProfile = async (e) => {
    e.preventDefault()
    if (savingProfile) return
    const validation = validateProfile()
    if (Object.keys(validation).length) {
      setErrors(validation)
      return
    }

    setSavingProfile(true)
    setErrors({})
    try {
      const data = new FormData()
      data.append('name', form.name.trim())
      data.append('email', form.email.trim())
      data.append('phone', form.phone.trim())
      if (avatarFile) data.append('avatar', avatarFile)
      await settingsService.updateProfileWithAvatar(data)
      await refreshUser()
      toast.success('Profile updated')
      setAvatarFile(null)
    } catch (err) {
      const fieldErrors = backendErrors(err)
      if (fieldErrors) setErrors(fieldErrors)
      toast.error(getErrorMessage(err))
    } finally {
      setSavingProfile(false)
    }
  }

  const validatePassword = () => {
    const next = {}
    if (!passwords.current_password) next.current_password = 'Current password is required.'
    if (!passwords.password) next.password = 'New password is required.'
    else if (!isValidPassword(passwords.password)) next.password = 'At least 8 characters with letters and numbers.'
    if (passwords.password !== passwords.password_confirmation) next.password_confirmation = 'Passwords do not match.'
    return next
  }

  const submitPassword = async (e) => {
    e.preventDefault()
    if (savingPassword) return
    const validation = validatePassword()
    if (Object.keys(validation).length) {
      setPasswordErrors(validation)
      return
    }

    setSavingPassword(true)
    setPasswordErrors({})
    try {
      await settingsService.updateProfile(passwords)
      toast.success('Password changed')
      setPasswords({ current_password: '', password: '', password_confirmation: '' })
    } catch (err) {
      const fieldErrors = backendErrors(err)
      if (fieldErrors) setPasswordErrors(fieldErrors)
      toast.error(getErrorMessage(err))
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <div className="grid max-w-3xl gap-8">
      <form onSubmit={submitProfile} noValidate className="space-y-4">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <UserRound className="h-4.5 w-4.5 text-primary" /> Profile Information
        </h3>
        <PhotoUploader
          name="avatar"
          preview={avatarPreview}
          fullName={form.name}
          onChange={(file) => {
            setAvatarFile(file)
            if (file) {
              setAvatarPreview(URL.createObjectURL(file))
            } else {
              setAvatarPreview(user?.avatar_url || '')
            }
          }}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Name *</label>
            <input
              className={`input ${errors.name ? 'input-invalid' : ''}`}
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
            />
            {errors.name && <p className="form-error">{errors.name}</p>}
          </div>
          <div>
            <label className="label">Email *</label>
            <input
              type="email"
              className={`input ${errors.email ? 'input-invalid' : ''}`}
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
            />
            {errors.email && <p className="form-error">{errors.email}</p>}
          </div>
          <div>
            <label className="label">Phone</label>
            <input
              className={`input ${errors.phone ? 'input-invalid' : ''}`}
              value={form.phone}
              onChange={(e) => setField('phone', sanitizePhone(e.target.value))}
            />
            {errors.phone && <p className="form-error">{errors.phone}</p>}
          </div>
          <div>
            <label className="label">Role</label>
            <input className="input capitalize" value={user?.role || ''} disabled />
          </div>
        </div>
        <button className="btn-primary" disabled={savingProfile}>
          {savingProfile ? <LoadingSpinner size="sm" /> : <Save className="h-4 w-4" />}
          {savingProfile ? 'Saving...' : 'Save Changes'}
        </button>
      </form>

      <hr className="border-border-color" />

      <form onSubmit={submitPassword} noValidate className="space-y-4">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Lock className="h-4.5 w-4.5 text-primary" /> Change Password
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Current Password *</label>
            <input
              type="password"
              className={`input ${passwordErrors.current_password ? 'input-invalid' : ''}`}
              value={passwords.current_password}
              onChange={(e) => {
                setPasswords({ ...passwords, current_password: e.target.value })
                setPasswordErrors((prev) => ({ ...prev, current_password: undefined }))
              }}
            />
            {passwordErrors.current_password && <p className="form-error">{passwordErrors.current_password}</p>}
          </div>
          <div>
            <label className="label">New Password *</label>
            <input
              type="password"
              className={`input ${passwordErrors.password ? 'input-invalid' : ''}`}
              value={passwords.password}
              onChange={(e) => {
                setPasswords({ ...passwords, password: e.target.value })
                setPasswordErrors((prev) => ({ ...prev, password: undefined }))
              }}
            />
            {passwordErrors.password && <p className="form-error">{passwordErrors.password}</p>}
          </div>
          <div>
            <label className="label">Confirm Password *</label>
            <input
              type="password"
              className={`input ${passwordErrors.password_confirmation ? 'input-invalid' : ''}`}
              value={passwords.password_confirmation}
              onChange={(e) => {
                setPasswords({ ...passwords, password_confirmation: e.target.value })
                setPasswordErrors((prev) => ({ ...prev, password_confirmation: undefined }))
              }}
            />
            {passwordErrors.password_confirmation && <p className="form-error">{passwordErrors.password_confirmation}</p>}
          </div>
        </div>
        <button className="btn-secondary" disabled={savingPassword}>
          {savingPassword ? <LoadingSpinner size="sm" /> : <Lock className="h-4 w-4" />}
          {savingPassword ? 'Saving...' : 'Change Password'}
        </button>
      </form>
    </div>
  )
}

function GymTab() {
  const [settings, setSettings] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

  useEffect(() => {
    settingsService
      .get()
      .then((res) => setSettings(res.data.data ?? res.data))
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    if (saving) return
    const next = {}
    if (settings.contact_phone && !isValidPhone(settings.contact_phone)) {
      next.contact_phone = 'Enter a valid PH mobile number (e.g. 09171234567).'
    }
    if (settings.contact_email && !isValidEmail(settings.contact_email)) {
      next.contact_email = 'Enter a valid email address.'
    }
    if (Object.keys(next).length) {
      setErrors(next)
      return
    }

    setSaving(true)
    setErrors({})
    try {
      await settingsService.update(settings)
      toast.success('Gym settings saved')
    } catch (err) {
      const fieldErrors = backendErrors(err)
      if (fieldErrors) setErrors(fieldErrors)
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <form onSubmit={submit} noValidate className="grid max-w-3xl gap-4 sm:grid-cols-2">
      {[
        { key: 'gym_name', label: 'Gym Name' },
        { key: 'address', label: 'Address' },
        { key: 'contact_phone', label: 'Phone' },
        { key: 'contact_email', label: 'Email' },
        { key: 'operating_hours', label: 'Operating Hours' },
        { key: 'currency', label: 'Currency Symbol' },
        { key: 'timezone', label: 'Timezone' },
      ].map((field) => (
        <div key={field.key}>
          <label className="label">{field.label}</label>
          <input
            className={`input ${errors[field.key] ? 'input-invalid' : ''}`}
            value={settings[field.key] ?? ''}
            onChange={(e) => {
              setSettings({
                ...settings,
                [field.key]: field.key.includes('phone') ? sanitizePhone(e.target.value) : e.target.value,
              })
              setErrors((prev) => ({ ...prev, [field.key]: undefined }))
            }}
          />
          {errors[field.key] && <p className="form-error">{errors[field.key]}</p>}
        </div>
      ))}
      <div className="sm:col-span-2">
        <label className="label">Footer Text</label>
        <textarea
          className="input"
          rows={2}
          value={settings.footer_text ?? ''}
          onChange={(e) => setSettings({ ...settings, footer_text: e.target.value })}
          placeholder="Shown on public pages"
        />
      </div>
      <div className="sm:col-span-2">
        <button className="btn-primary" disabled={saving}>
          {saving ? <LoadingSpinner size="sm" /> : <Save className="h-4 w-4" />}
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </form>
  )
}

const emptyUserForm = { name: '', email: '', password: '', phone: '', role: 'staff', is_active: true }

function UsersTab() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyUserForm)
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState('')
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await settingsService.users({ per_page: 50 })
      setUsers(res.data.data ?? res.data)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openForm = (u = null) => {
    setEditing(u)
    setErrors({})
    setAvatarFile(null)
    setAvatarPreview(u?.avatar_url || '')
    setForm(
      u
        ? { name: u.name, email: u.email, password: '', phone: u.phone || '', role: u.role, is_active: u.is_active }
        : emptyUserForm,
    )
    setFormOpen(true)
  }

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev))
  }

  const validate = () => {
    const next = {}
    if (!form.name.trim()) next.name = 'Name is required.'
    else if (!isValidName(form.name)) next.name = 'Use letters, spaces, hyphens, apostrophes or periods only.'
    if (!form.email.trim()) next.email = 'Email is required.'
    else if (!isValidEmail(form.email)) next.email = 'Enter a valid email address.'
    if (!form.password && !editing) next.password = 'Password is required.'
    else if (form.password && !isValidPassword(form.password)) next.password = 'At least 8 characters with letters and numbers.'
    if (form.phone && !isValidPhone(form.phone)) next.phone = 'Enter a valid PH mobile number (e.g. 09171234567).'
    if (!['admin', 'staff', 'trainer'].includes(form.role)) next.role = 'Select a valid staff role.'
    return next
  }

  const submit = async (e) => {
    e.preventDefault()
    if (saving) return
    const validation = validate()
    if (Object.keys(validation).length) {
      setErrors(validation)
      return
    }

    setSaving(true)
    setErrors({})
    try {
      const payload = new FormData()
      payload.append('name', form.name.trim())
      payload.append('email', form.email.trim())
      payload.append('phone', form.phone.trim())
      payload.append('role', form.role)
      payload.append('is_active', form.is_active ? '1' : '0')
      if (form.password) payload.append('password', form.password)
      if (avatarFile) payload.append('avatar', avatarFile)

      if (editing) {
        await settingsService.updateUserWithAvatar(editing.id, payload)
        toast.success('User updated')
      } else {
        await settingsService.createUserWithAvatar(payload)
        toast.success('User created')
      }
      setFormOpen(false)
      load()
    } catch (err) {
      const fieldErrors = backendErrors(err)
      if (fieldErrors) setErrors(fieldErrors)
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button className="btn-primary" onClick={() => openForm()}>Add User</button>
      </div>
      {loading ? (
        <TableSkeleton rows={4} cols={5} />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border-color">
            <thead className="bg-slate-50">
              <tr>
                <th className="table-th">User</th>
                <th className="table-th">Role</th>
                <th className="table-th">Status</th>
                <th className="table-th">Last Login</th>
                <th className="table-th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-color">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="table-td">
                    <div className="flex items-center gap-3">
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt={u.name} className="h-9 w-9 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-light-green text-xs font-semibold text-primary">
                          {getInitials(u.name)}
                        </span>
                      )}
                      <div>
                        <p className="font-medium">{u.name}</p>
                        <p className="text-xs text-secondary-text">{u.email}</p>
                        {u.role === 'trainer' && (
                          <p className="text-xs font-medium text-primary">
                            {u.trainer ? 'Trainer profile linked' : 'No trainer profile'}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="table-td capitalize">{u.role}</td>
                  <td className="table-td"><StatusBadge status={u.is_active ? 'active' : 'suspended'} /></td>
                  <td className="table-td text-xs">{u.last_login_at ? formatDate(u.last_login_at) : 'Never'}</td>
                  <td className="table-td text-right">
                    <button className="btn-secondary !px-3 !py-1.5 !text-xs" onClick={() => openForm(u)}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={formOpen} title={editing ? 'Edit User' : 'Add User'} onClose={() => !saving && setFormOpen(false)}>
        <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <PhotoUploader
              name="avatar"
              preview={avatarPreview}
              fullName={form.name}
              onChange={(file) => {
                setAvatarFile(file)
                setAvatarPreview(file ? URL.createObjectURL(file) : editing?.avatar_url || '')
              }}
            />
          </div>
          <div>
            <label className="label">Name *</label>
            <input
              className={`input ${errors.name ? 'input-invalid' : ''}`}
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
            />
            {errors.name && <p className="form-error">{errors.name}</p>}
          </div>
          <div>
            <label className="label">Email *</label>
            <input
              type="email"
              className={`input ${errors.email ? 'input-invalid' : ''}`}
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
            />
            {errors.email && <p className="form-error">{errors.email}</p>}
          </div>
          <div>
            <label className="label">{editing ? 'New Password (optional)' : 'Password *'}</label>
            <input
              type="password"
              className={`input ${errors.password ? 'input-invalid' : ''}`}
              value={form.password}
              onChange={(e) => setField('password', e.target.value)}
            />
            {errors.password && <p className="form-error">{errors.password}</p>}
          </div>
          <div>
            <label className="label">Phone</label>
            <input
              className={`input ${errors.phone ? 'input-invalid' : ''}`}
              value={form.phone}
              onChange={(e) => setField('phone', sanitizePhone(e.target.value))}
            />
            {errors.phone && <p className="form-error">{errors.phone}</p>}
          </div>
          <div>
            <label className="label">Role *</label>
            <select
              className={`input ${errors.role ? 'input-invalid' : ''}`}
              value={form.role}
              onChange={(e) => setField('role', e.target.value)}
            >
              <option value="admin">Admin</option>
              <option value="staff">Staff</option>
              <option value="trainer">Trainer</option>
            </select>
            {errors.role && <p className="form-error">{errors.role}</p>}
            {form.role === 'trainer' && (
              <p className="mt-1 text-xs text-secondary-text">
                A trainer profile is created and linked automatically.
              </p>
            )}
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 pb-3 text-sm font-medium">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setField('is_active', e.target.checked)} className="h-4 w-4 accent-green-600" />
              Active
            </label>
          </div>
          <div className="flex justify-end gap-3 sm:col-span-2">
            <button type="button" className="btn-secondary" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? <LoadingSpinner size="sm" /> : null}
              {saving ? 'Saving...' : editing ? 'Update User' : 'Create User'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
