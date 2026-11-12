import { Pencil, Plus, Search, Trash2, UserSquare2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import EmptyState from '@/components/common/EmptyState'
import ErrorState from '@/components/common/ErrorState'
import LoadingSpinner from '@/components/common/LoadingSpinner'
import Modal from '@/components/common/Modal'
import Pagination from '@/components/common/Pagination'
import PhotoUploader from '@/components/common/PhotoUploader'
import { TableSkeleton } from '@/components/common/Skeleton'
import StatusBadge from '@/components/common/StatusBadge'
import PageHeader from '@/components/layout/PageHeader'
import { useDebounce } from '@/hooks/useDebounce'
import { trainerService } from '@/services'
import { getErrorMessage } from '@/services/api'
import { getInitials, sanitizePhone } from '@/utils/format'
import { isValidEmail, isValidName, isValidPassword, isValidPhone } from '@/utils/validation'

const initialForm = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  specialization: '',
  availability: '',
  bio: '',
  status: 'active',
}

export default function TrainersPage() {
  const [trainers, setTrainers] = useState([])
  const [meta, setMeta] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchInput, setSearchInput] = useState('')
  const search = useDebounce(searchInput, 400)
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(initialForm)
  const [errors, setErrors] = useState({})
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [createAccount, setCreateAccount] = useState(false)
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await trainerService.list({ search: search || undefined, status, page, per_page: 10 })
      setTrainers(res.data.data)
      setMeta(res.data.meta)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [search, status, page])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [search, status])

  const openForm = (trainer = null) => {
    setEditing(trainer)
    setErrors({})
    setPhotoFile(null)
    setPhotoPreview(trainer?.photo_url || '')
    setCreateAccount(false)
    setPassword('')
    setForm(
      trainer
        ? {
            first_name: trainer.first_name,
            last_name: trainer.last_name,
            email: trainer.email,
            phone: trainer.phone || '',
            specialization: trainer.specialization || '',
            availability: trainer.availability || '',
            bio: trainer.bio || '',
            status: trainer.status,
          }
        : initialForm,
    )
    setFormOpen(true)
  }

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev))
  }

  const validate = () => {
    const next = {}
    if (!form.first_name.trim()) next.first_name = 'First name is required.'
    else if (!isValidName(form.first_name)) next.first_name = 'Use letters, spaces, hyphens, apostrophes or periods only.'
    if (!form.last_name.trim()) next.last_name = 'Last name is required.'
    else if (!isValidName(form.last_name)) next.last_name = 'Use letters, spaces, hyphens, apostrophes or periods only.'
    if (!form.email.trim()) next.email = 'Email is required.'
    else if (!isValidEmail(form.email)) next.email = 'Enter a valid email address.'
    if (form.phone && !isValidPhone(form.phone)) next.phone = 'Enter a valid PH mobile number (e.g. 09171234567).'
    if (form.specialization && form.specialization.length > 255) next.specialization = 'Maximum 255 characters.'
    if (form.availability && form.availability.length > 255) next.availability = 'Maximum 255 characters.'
    if (form.bio && form.bio.length > 2000) next.bio = 'Maximum 2000 characters.'
    if (!editing?.user_id && createAccount && !password) {
      next.password = 'Password is required to create a login account.'
    } else if (password && !isValidPassword(password)) {
      next.password = 'At least 8 characters with letters and numbers.'
    }
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
      Object.entries(form).forEach(([key, value]) => payload.append(key, value ?? ''))
      payload.append('create_account', createAccount ? '1' : '0')
      if (password && (createAccount || editing?.user_id)) payload.append('password', password)
      if (photoFile) payload.append('photo', photoFile)

      if (editing) {
        await trainerService.updateWithPhoto(editing.id, payload)
        toast.success('Trainer updated')
      } else {
        await trainerService.createWithPhoto(payload)
        toast.success('Trainer created')
      }
      setFormOpen(false)
      load()
    } catch (err) {
      const fieldErrors = err?.response?.data?.errors
      if (fieldErrors) {
        setErrors(Object.fromEntries(Object.entries(fieldErrors).map(([key, value]) => [key, [].concat(value)[0]])))
      }
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    try {
      const res = await trainerService.delete(deleting.id)
      toast.success(res.data.message || 'Trainer deleted')
      setDeleting(null)
      load()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  return (
    <div>
      <PageHeader title="Trainers" subtitle="Manage trainer profiles and availability.">
        <button className="btn-primary" onClick={() => openForm()}>
          <Plus className="h-4.5 w-4.5" /> Add Trainer
        </button>
      </PageHeader>

      <div className="card mb-6 flex flex-col gap-3 p-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-secondary-text" />
          <input className="input !pl-11" placeholder="Search trainers..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </div>
        <select className="input !w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : loading ? (
          <TableSkeleton rows={5} cols={6} />
        ) : trainers.length === 0 ? (
          <EmptyState icon={UserSquare2} title="No trainers found" description="Add your first trainer to get started." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border-color">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="table-th">Trainer</th>
                    <th className="table-th">Specialization</th>
                    <th className="table-th">Availability</th>
                    <th className="table-th">Appointments</th>
                    <th className="table-th">Status</th>
                    <th className="table-th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-color">
                  {trainers.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="table-td">
                        <div className="flex items-center gap-3">
                          {t.photo_url ? (
                            <img src={t.photo_url} alt={t.full_name} className="h-9 w-9 rounded-full object-cover" />
                          ) : (
                            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-light-green text-xs font-bold text-primary">
                              {getInitials(t.full_name)}
                            </span>
                          )}
                          <div>
                            <p className="font-medium">{t.full_name}</p>
                            <p className="text-xs text-secondary-text">{t.email}</p>
                            <p className={`text-xs font-medium ${t.has_login ? 'text-primary' : 'text-secondary-text'}`}>
                              {t.has_login ? 'Login account enabled' : 'No login account'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="table-td">{t.specialization || '—'}</td>
                      <td className="table-td text-xs">{t.availability || '—'}</td>
                      <td className="table-td">{t.appointments_count ?? 0}</td>
                      <td className="table-td"><StatusBadge status={t.status} /></td>
                      <td className="table-td">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => openForm(t)} className="rounded-lg p-2 text-secondary-text hover:bg-amber-50 hover:text-amber-600" title="Edit">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button onClick={() => setDeleting(t)} className="rounded-lg p-2 text-secondary-text hover:bg-red-50 hover:text-red-600" title="Delete / deactivate">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination meta={meta} onPageChange={setPage} />
          </>
        )}
      </div>

      <Modal open={formOpen} title={editing ? 'Edit Trainer' : 'Add Trainer'} onClose={() => !saving && setFormOpen(false)}>
        <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <PhotoUploader
              name="photo"
              preview={photoPreview}
              fullName={`${form.first_name} ${form.last_name}`.trim()}
              onChange={(file) => {
                setPhotoFile(file)
                setPhotoPreview(file ? URL.createObjectURL(file) : editing?.photo_url || '')
              }}
            />
          </div>
          <div>
            <label className="label">First Name *</label>
            <input
              className={`input ${errors.first_name ? 'input-invalid' : ''}`}
              value={form.first_name}
              onChange={(e) => setField('first_name', e.target.value)}
            />
            {errors.first_name && <p className="form-error">{errors.first_name}</p>}
          </div>
          <div>
            <label className="label">Last Name *</label>
            <input
              className={`input ${errors.last_name ? 'input-invalid' : ''}`}
              value={form.last_name}
              onChange={(e) => setField('last_name', e.target.value)}
            />
            {errors.last_name && <p className="form-error">{errors.last_name}</p>}
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
            <label className="label">Specialization</label>
            <input
              className={`input ${errors.specialization ? 'input-invalid' : ''}`}
              value={form.specialization}
              onChange={(e) => setField('specialization', e.target.value)}
              placeholder="e.g. Strength & Conditioning"
            />
            {errors.specialization && <p className="form-error">{errors.specialization}</p>}
          </div>
          <div>
            <label className="label">Availability</label>
            <input
              className={`input ${errors.availability ? 'input-invalid' : ''}`}
              value={form.availability}
              onChange={(e) => setField('availability', e.target.value)}
              placeholder="e.g. Mon-Fri 6AM-2PM"
            />
            {errors.availability && <p className="form-error">{errors.availability}</p>}
          </div>
          <div className="sm:col-span-2">
            <label className="label">Bio</label>
            <textarea
              className={`input ${errors.bio ? 'input-invalid' : ''}`}
              rows={3}
              value={form.bio}
              onChange={(e) => setField('bio', e.target.value)}
            />
            {errors.bio && <p className="form-error">{errors.bio}</p>}
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status} onChange={(e) => setField('status', e.target.value)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="rounded-xl border border-border-color bg-pale-green/70 p-4 sm:col-span-2">
            <p className="text-sm font-semibold text-main-text">User Management Login</p>
            {editing?.user_id ? (
              <p className="mt-1 text-xs text-secondary-text">
                This trainer already has a login account in User Management. Enter a new password below only if you want to reset it.
              </p>
            ) : (
              <label className="mt-2 flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={createAccount}
                  onChange={(e) => {
                    setCreateAccount(e.target.checked)
                    if (!e.target.checked) setPassword('')
                    setErrors((prev) => ({ ...prev, password: undefined }))
                  }}
                  className="h-4 w-4 accent-green-600"
                />
                Create a login account for this trainer
              </label>
            )}
            {(createAccount || editing?.user_id) && (
              <div className="mt-3">
                <label className="label">
                  {editing?.user_id ? 'New Password (optional)' : 'Password *'}
                </label>
                <input
                  type="password"
                  className={`input ${errors.password ? 'input-invalid' : ''}`}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setErrors((prev) => ({ ...prev, password: undefined }))
                  }}
                  placeholder="At least 8 characters with letters and numbers"
                  autoComplete="new-password"
                />
                {errors.password && <p className="form-error">{errors.password}</p>}
              </div>
            )}
          </div>
          <div className="flex items-end justify-end gap-3 sm:col-span-2">
            <button type="button" className="btn-secondary" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? <LoadingSpinner size="sm" /> : null}
              {saving ? 'Saving...' : editing ? 'Update Trainer' : 'Create Trainer'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete / Deactivate Trainer"
        message={
          deleting?.appointments_count
            ? `${deleting?.full_name} has appointment history and will be deactivated instead of deleted. Continue?`
            : `Permanently delete ${deleting?.full_name}?`
        }
        confirmLabel="Confirm"
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
