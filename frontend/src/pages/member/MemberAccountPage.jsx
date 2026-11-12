import { Calendar, CreditCard, History, Lock, Mail, MapPin, Pencil, Phone, User, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import EmptyState from '@/components/common/EmptyState'
import ErrorState from '@/components/common/ErrorState'
import LoadingSpinner from '@/components/common/LoadingSpinner'
import Modal from '@/components/common/Modal'
import PhotoUploader from '@/components/common/PhotoUploader'
import StatusBadge from '@/components/common/StatusBadge'
import PageHeader from '@/components/layout/PageHeader'
import { portalService, settingsService } from '@/services'
import { getErrorMessage } from '@/services/api'
import { useAuth } from '@/context/AuthContext'
import { formatCurrency, formatDate, formatDateTime, getInitials, sanitizePhone } from '@/utils/format'
import { isValidName, isValidPassword, isValidPhone } from '@/utils/validation'

export default function MemberAccountPage() {
  const { refreshUser } = useAuth()
  const [profile, setProfile] = useState(null)
  const [memberships, setMemberships] = useState([])
  const [payments, setPayments] = useState([])
  const [attendance, setAttendance] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('overview')
  const [tabLoading, setTabLoading] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [editErrors, setEditErrors] = useState({})

  const loadProfile = () => {
    setLoading(true)
    setError(null)
    portalService
      .profile()
      .then((res) => setProfile(res.data.data))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadProfile()
  }, [])

  useEffect(() => {
    if (tab === 'overview') return
    setTabLoading(true)
    const loaders = {
      memberships: () => portalService.memberships().then((r) => setMemberships(r.data.data)),
      payments: () => portalService.payments({ per_page: 20 }).then((r) => setPayments(r.data.data)),
      attendance: () => portalService.attendance({ per_page: 20 }).then((r) => setAttendance(r.data.data)),
    }
    loaders[tab]()
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setTabLoading(false))
  }, [tab])

  if (loading) return <div className="flex justify-center py-20"><LoadingSpinner /></div>
  if (error) return <ErrorState message={error} onRetry={loadProfile} />
  if (!profile) return null

  const current = profile.current_membership || profile.latest_membership
  const plan = current?.plan

  const openEdit = () => {
    setEditForm({
      first_name: profile.first_name || '',
      last_name: profile.last_name || '',
      phone: profile.phone || '',
      address: profile.address || '',
      gender: profile.gender || '',
      date_of_birth: profile.date_of_birth ? profile.date_of_birth.slice(0, 10) : '',
      emergency_contact_name: profile.emergency_contact_name || '',
      emergency_contact_phone: profile.emergency_contact_phone || '',
    })
    setPhotoFile(null)
    setPhotoPreview(profile.photo_url || '')
    setEditErrors({})
    setEditOpen(true)
  }

  const setEditField = (key, value) => {
    setEditForm((prev) => ({ ...prev, [key]: value }))
    setEditErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev))
  }

  const validateEdit = () => {
    const next = {}
    if (!editForm.first_name.trim()) next.first_name = 'First name is required.'
    else if (!isValidName(editForm.first_name)) next.first_name = 'Use letters, spaces, hyphens, apostrophes or periods only.'
    if (!editForm.last_name.trim()) next.last_name = 'Last name is required.'
    else if (!isValidName(editForm.last_name)) next.last_name = 'Use letters, spaces, hyphens, apostrophes or periods only.'
    if (editForm.phone && !isValidPhone(editForm.phone)) next.phone = 'Enter a valid PH mobile number (e.g. 09171234567).'
    if (editForm.address && editForm.address.length > 255) next.address = 'Address must be 255 characters or fewer.'
    if (editForm.date_of_birth && editForm.date_of_birth > new Date().toISOString().slice(0, 10)) {
      next.date_of_birth = 'Date of birth cannot be in the future.'
    }
    if (editForm.emergency_contact_name && !isValidName(editForm.emergency_contact_name)) {
      next.emergency_contact_name = 'Use letters and common name punctuation only.'
    }
    if (editForm.emergency_contact_phone && !isValidPhone(editForm.emergency_contact_phone)) {
      next.emergency_contact_phone = 'Enter a valid PH mobile number (e.g. 09171234567).'
    }
    setEditErrors(next)
    return Object.keys(next).length === 0
  }

  const handlePhotoChange = (file) => {
    setPhotoFile(file)
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => setPhotoPreview(e.target.result)
      reader.readAsDataURL(file)
    } else {
      setPhotoPreview('')
    }
  }

  const submitEdit = async (e) => {
    e.preventDefault()
    if (saving) return
    if (!validateEdit()) return

    setSaving(true)
    try {
      let res
      if (photoFile) {
        const fd = new FormData()
        fd.append('_method', 'PUT')
        Object.entries(editForm).forEach(([key, value]) => {
          if (value !== null && value !== undefined && value !== '') fd.append(key, value)
        })
        fd.append('photo', photoFile)
        res = await portalService.updateProfilePost(fd)
      } else {
        res = await portalService.updateProfile(editForm)
      }
      setProfile(res.data.data)
      refreshUser?.()
      toast.success('Profile updated')
      setEditOpen(false)
    } catch (err) {
      const fieldErrors = err?.response?.data?.errors
      if (fieldErrors) {
        setEditErrors(Object.fromEntries(Object.entries(fieldErrors).map(([key, value]) => [key, [].concat(value)[0]])))
      }
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader title="My Profile" subtitle="Your membership details and history.">
        <button className="btn-primary" onClick={openEdit}>
          <Pencil className="h-4.5 w-4.5" /> Edit Profile
        </button>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card h-fit overflow-hidden">
          <div className="bg-gradient-to-br from-primary to-secondary px-6 py-8 text-center">
            {profile.photo_url ? (
              <img
                src={profile.photo_url}
                alt={profile.full_name}
                className="mx-auto h-20 w-20 rounded-full border-2 border-white/40 object-cover"
              />
            ) : (
              <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white/20 text-2xl font-bold text-white">
                {getInitials(profile.full_name)}
              </span>
            )}
            <h2 className="mt-3 text-lg font-bold text-white">{profile.full_name}</h2>
            <p className="mt-1 text-sm text-white/80">{profile.member_code}</p>
            <div className="mt-3 flex justify-center">
              <StatusBadge status={profile.status} />
            </div>
          </div>
          <dl className="divide-y divide-border-color text-sm">
            {[
              { icon: Phone, label: 'Phone', value: profile.phone },
              { icon: Mail, label: 'Email', value: profile.email },
              { icon: MapPin, label: 'Address', value: profile.address },
              { icon: User, label: 'Gender', value: profile.gender },
              { icon: Calendar, label: 'Date of Birth', value: formatDate(profile.date_of_birth) },
              { icon: Users, label: 'Emergency Contact', value: profile.emergency_contact_name ? `${profile.emergency_contact_name} · ${profile.emergency_contact_phone || '—'}` : null },
            ].map((row) => (
              <div key={row.label} className="flex items-start gap-3 px-6 py-3">
                <row.icon className="mt-0.5 h-4 w-4 shrink-0 text-secondary-text" />
                <div className="min-w-0">
                  <dt className="text-xs text-secondary-text">{row.label}</dt>
                  <dd className="font-medium">{row.value || '—'}</dd>
                </div>
              </div>
            ))}
          </dl>
        </div>

        <div className="lg:col-span-2">
          <div className="card overflow-hidden">
            <div className="flex overflow-x-auto border-b border-border-color">
              {[
                { id: 'overview', label: 'Overview' },
                { id: 'memberships', label: 'Memberships' },
                { id: 'payments', label: 'Payments' },
                { id: 'attendance', label: 'Attendance' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`whitespace-nowrap border-b-2 px-5 py-3.5 text-sm font-medium transition-colors ${
                    tab === t.id ? 'border-primary text-primary' : 'border-transparent text-secondary-text hover:text-main-text'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="p-5">
              {tabLoading ? (
                <div className="flex justify-center py-10"><LoadingSpinner /></div>
              ) : tab === 'overview' ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <InfoCard label="Current Plan" value={plan?.name || 'No plan'} accent />
                  <InfoCard label="Expiration Date" value={formatDate(current?.end_date)} />
                  <InfoCard label="Membership Status" value={current?.status || '—'} />
                  <InfoCard label="Member Since" value={formatDate(profile.created_at)} />
                </div>
              ) : tab === 'memberships' ? (
                memberships.length === 0 ? (
                  <EmptyState icon={History} title="No memberships" description="Your membership history will appear here." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-border-color">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="table-th">Plan</th>
                          <th className="table-th">Start</th>
                          <th className="table-th">End</th>
                          <th className="table-th">Amount</th>
                          <th className="table-th">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-color">
                        {memberships.map((row) => (
                          <tr key={row.id}>
                            <td className="table-td font-medium">{row.plan?.name || '—'}</td>
                            <td className="table-td">{formatDate(row.start_date)}</td>
                            <td className="table-td">{formatDate(row.end_date)}</td>
                            <td className="table-td">{formatCurrency(row.amount)}</td>
                            <td className="table-td"><StatusBadge status={row.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : tab === 'payments' ? (
                payments.length === 0 ? (
                  <EmptyState icon={CreditCard} title="No payments" description="Your payment history will appear here." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-border-color">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="table-th">Payment #</th>
                          <th className="table-th">Amount</th>
                          <th className="table-th">Method</th>
                          <th className="table-th">Date</th>
                          <th className="table-th">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-color">
                        {payments.map((row) => (
                          <tr key={row.id}>
                            <td className="table-td font-mono text-xs">{row.payment_number}</td>
                            <td className="table-td font-medium">{formatCurrency(row.amount)}</td>
                            <td className="table-td capitalize">{row.payment_method?.replace('_', ' ')}</td>
                            <td className="table-td">{formatDateTime(row.paid_at || row.created_at)}</td>
                            <td className="table-td"><StatusBadge status={row.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : attendance.length === 0 ? (
                <EmptyState icon={Calendar} title="No attendance records" description="Your visits will appear here." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border-color">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="table-th">Date</th>
                        <th className="table-th">Check-in</th>
                        <th className="table-th">Check-out</th>
                        <th className="table-th">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-color">
                      {attendance.map((row) => (
                        <tr key={row.id}>
                          <td className="table-td">{formatDate(row.date)}</td>
                          <td className="table-td">{row.check_in ? formatDateTime(row.check_in) : '—'}</td>
                          <td className="table-td">{row.check_out ? formatDateTime(row.check_out) : '—'}</td>
                          <td className="table-td"><StatusBadge status={row.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <PasswordCard />
        </div>
      </div>

      <Modal open={editOpen} title="Edit Profile" onClose={() => !saving && setEditOpen(false)}>
        {editForm && (
          <form onSubmit={submitEdit} noValidate className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <PhotoUploader
                name="photo"
                preview={photoPreview}
                onChange={handlePhotoChange}
                fullName={`${editForm.first_name} ${editForm.last_name}`.trim()}
              />
              {editErrors.photo && <p className="form-error">{editErrors.photo}</p>}
            </div>

            <div>
              <label className="label">First Name *</label>
              <input
                className={`input ${editErrors.first_name ? 'input-invalid' : ''}`}
                value={editForm.first_name}
                onChange={(e) => setEditField('first_name', e.target.value)}
              />
              {editErrors.first_name && <p className="form-error">{editErrors.first_name}</p>}
            </div>
            <div>
              <label className="label">Last Name *</label>
              <input
                className={`input ${editErrors.last_name ? 'input-invalid' : ''}`}
                value={editForm.last_name}
                onChange={(e) => setEditField('last_name', e.target.value)}
              />
              {editErrors.last_name && <p className="form-error">{editErrors.last_name}</p>}
            </div>
            <div>
              <label className="label">Phone</label>
              <input
                className={`input ${editErrors.phone ? 'input-invalid' : ''}`}
                value={editForm.phone}
                onChange={(e) => setEditField('phone', sanitizePhone(e.target.value))}
              />
              {editErrors.phone && <p className="form-error">{editErrors.phone}</p>}
            </div>
            <div>
              <label className="label">Gender</label>
              <select className="input" value={editForm.gender} onChange={(e) => setEditField('gender', e.target.value)}>
                <option value="">Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="label">Date of Birth</label>
              <input
                type="date"
                className={`input ${editErrors.date_of_birth ? 'input-invalid' : ''}`}
                value={editForm.date_of_birth}
                onChange={(e) => setEditField('date_of_birth', e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
              />
              {editErrors.date_of_birth && <p className="form-error">{editErrors.date_of_birth}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="label">Address</label>
              <input
                className={`input ${editErrors.address ? 'input-invalid' : ''}`}
                value={editForm.address}
                onChange={(e) => setEditField('address', e.target.value)}
                maxLength={255}
              />
              {editErrors.address && <p className="form-error">{editErrors.address}</p>}
            </div>
            <div>
              <label className="label">Emergency Contact Name</label>
              <input
                className={`input ${editErrors.emergency_contact_name ? 'input-invalid' : ''}`}
                value={editForm.emergency_contact_name}
                onChange={(e) => setEditField('emergency_contact_name', e.target.value)}
              />
              {editErrors.emergency_contact_name && <p className="form-error">{editErrors.emergency_contact_name}</p>}
            </div>
            <div>
              <label className="label">Emergency Contact Phone</label>
              <input
                className={`input ${editErrors.emergency_contact_phone ? 'input-invalid' : ''}`}
                value={editForm.emergency_contact_phone}
                onChange={(e) => setEditField('emergency_contact_phone', sanitizePhone(e.target.value))}
              />
              {editErrors.emergency_contact_phone && <p className="form-error">{editErrors.emergency_contact_phone}</p>}
            </div>
            <div className="flex justify-end gap-3 pt-2 sm:col-span-2">
              <button type="button" className="btn-secondary" onClick={() => setEditOpen(false)} disabled={saving}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? <LoadingSpinner size="sm" /> : <Pencil className="h-4 w-4" />}
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}

function InfoCard({ label, value, accent }) {
  return (
    <div className={`rounded-xl border border-border-color p-5 ${accent ? 'bg-pale-green' : 'bg-slate-50'}`}>
      <p className="text-sm font-medium text-secondary-text">{label}</p>
      <p className={`mt-1 text-lg font-bold ${accent ? 'text-primary' : 'text-main-text'}`}>{value}</p>
    </div>
  )
}

function PasswordCard() {
  const [form, setForm] = useState({ current_password: '', password: '', password_confirmation: '' })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev))
  }

  const validate = () => {
    const next = {}
    if (!form.current_password) next.current_password = 'Current password is required.'
    if (!form.password) next.password = 'New password is required.'
    else if (!isValidPassword(form.password)) next.password = 'At least 8 characters with letters and numbers.'
    if (form.password !== form.password_confirmation) next.password_confirmation = 'Passwords do not match.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = async (e) => {
    e.preventDefault()
    if (saving) return
    if (!validate()) return

    setSaving(true)
    setErrors({})
    try {
      await settingsService.updateProfile(form)
      toast.success('Password changed')
      setForm({ current_password: '', password: '', password_confirmation: '' })
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

  return (
    <form onSubmit={submit} noValidate className="card mt-6 space-y-4">
      <h3 className="flex items-center gap-2 text-base font-semibold">
        <Lock className="h-4.5 w-4.5 text-primary" /> Change Password
      </h3>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label">Current Password *</label>
          <input
            type="password"
            className={`input ${errors.current_password ? 'input-invalid' : ''}`}
            value={form.current_password}
            onChange={(e) => setField('current_password', e.target.value)}
            autoComplete="current-password"
          />
          {errors.current_password && <p className="form-error">{errors.current_password}</p>}
        </div>
        <div>
          <label className="label">New Password *</label>
          <input
            type="password"
            className={`input ${errors.password ? 'input-invalid' : ''}`}
            value={form.password}
            onChange={(e) => setField('password', e.target.value)}
            autoComplete="new-password"
          />
          {errors.password && <p className="form-error">{errors.password}</p>}
        </div>
        <div>
          <label className="label">Confirm Password *</label>
          <input
            type="password"
            className={`input ${errors.password_confirmation ? 'input-invalid' : ''}`}
            value={form.password_confirmation}
            onChange={(e) => setField('password_confirmation', e.target.value)}
            autoComplete="new-password"
          />
          {errors.password_confirmation && <p className="form-error">{errors.password_confirmation}</p>}
        </div>
      </div>
      <button className="btn-secondary" disabled={saving}>
        {saving ? <LoadingSpinner size="sm" /> : <Lock className="h-4 w-4" />} Change Password
      </button>
    </form>
  )
}
