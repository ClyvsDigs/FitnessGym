import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import LoadingSpinner from '@/components/common/LoadingSpinner'
import Modal from '@/components/common/Modal'
import PhotoUploader from '@/components/common/PhotoUploader'
import { memberService, planService } from '@/services'
import { getErrorMessage } from '@/services/api'
import { sanitizePhone } from '@/utils/format'
import { isValidEmail, isValidName, isValidPhone } from '@/utils/validation'

const initialForm = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  address: '',
  date_of_birth: '',
  gender: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  status: 'pending',
  plan_id: '',
  membership_start_date: '',
}

export default function MemberForm({ open, member, onClose, onSaved }) {
  const [form, setForm] = useState(initialForm)
  const [plans, setPlans] = useState([])
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState('')

  useEffect(() => {
    if (open) {
      planService
        .list({ status: 'active', per_page: 100 })
        .then((res) => setPlans(res.data.data))
        .catch(() => setPlans([]))

      if (member) {
        setForm({
          first_name: member.first_name || '',
          last_name: member.last_name || '',
          email: member.email || '',
          phone: member.phone || '',
          address: member.address || '',
          date_of_birth: member.date_of_birth || '',
          gender: member.gender || '',
          emergency_contact_name: member.emergency_contact_name || '',
          emergency_contact_phone: member.emergency_contact_phone || '',
          status: member.status || 'pending',
          plan_id: '',
          membership_start_date: '',
        })
        setPhotoFile(null)
        setPhotoPreview(member.photo_url || '')
      } else {
        setForm({ ...initialForm, membership_start_date: new Date().toISOString().slice(0, 10) })
        setPhotoFile(null)
        setPhotoPreview('')
      }
      setErrors({})
    }
  }, [open, member])

  const set = (key) => (e) => {
    const value = e.target.value
    setForm((f) => ({ ...f, [key]: key.includes('phone') ? sanitizePhone(value) : value }))
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev))
  }

  const validate = () => {
    const errs = {}
    if (!form.first_name.trim()) errs.first_name = 'First name is required.'
    else if (!isValidName(form.first_name)) errs.first_name = 'Use letters, spaces, hyphens, apostrophes or periods only.'
    if (!form.last_name.trim()) errs.last_name = 'Last name is required.'
    else if (!isValidName(form.last_name)) errs.last_name = 'Use letters, spaces, hyphens, apostrophes or periods only.'
    if (!form.email.trim()) errs.email = 'Email is required.'
    else if (!isValidEmail(form.email)) errs.email = 'Enter a valid email address.'
    if (form.phone && !isValidPhone(form.phone)) errs.phone = 'Enter a valid PH mobile number (e.g. 09171234567).'
    if (form.address && form.address.length > 255) errs.address = 'Address must be 255 characters or fewer.'
    if (form.date_of_birth && form.date_of_birth > new Date().toISOString().slice(0, 10)) {
      errs.date_of_birth = 'Date of birth cannot be in the future.'
    }
    if (form.emergency_contact_name && !isValidName(form.emergency_contact_name)) {
      errs.emergency_contact_name = 'Use letters and common name punctuation only.'
    }
    if (form.emergency_contact_phone && !isValidPhone(form.emergency_contact_phone)) {
      errs.emergency_contact_phone = 'Enter a valid PH mobile number (e.g. 09171234567).'
    }
    if (form.plan_id && !form.membership_start_date) errs.membership_start_date = 'Start date is required with a plan.'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handlePhotoChange = (file) => {
    setPhotoFile(file)
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => setPhotoPreview(e.target.result)
      reader.readAsDataURL(file)
    } else {
      setPhotoPreview(member?.photo_url || '')
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    if (saving) return
    if (!validate()) return

    setSaving(true)
    try {
      const payload = {
        ...form,
        plan_id: form.plan_id || null,
        membership_start_date: form.membership_start_date || null,
      }

      let res
      if (photoFile) {
        const fd = new FormData()
        Object.entries(payload).forEach(([key, value]) => {
          if (value !== null && value !== undefined && value !== '') fd.append(key, value)
        })
        fd.append('photo', photoFile)
        if (member) {
          fd.append('_method', 'PUT')
          res = await memberService.updateWithPhoto(member.id, fd)
        } else {
          res = await memberService.create(fd)
        }
      } else if (member) {
        res = await memberService.update(member.id, payload)
      } else {
        res = await memberService.create(payload)
      }

      toast.success(member ? 'Member updated successfully' : 'Member created successfully')
      onSaved(res?.data?.data)
      onClose()
    } catch (error) {
      const message = getErrorMessage(error)
      toast.error(message)
      if (error.response?.status === 422 && error.response?.data?.errors) {
        const fieldErrors = {}
        Object.entries(error.response.data.errors).forEach(([key, msgs]) => {
          fieldErrors[key] = msgs[0]
        })
        setErrors(fieldErrors)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} title={member ? 'Edit Member' : 'Add New Member'} onClose={onClose} size="lg">
      <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <PhotoUploader
            name="photo"
            preview={photoPreview}
            onChange={handlePhotoChange}
            fullName={`${form.first_name} ${form.last_name}`.trim()}
          />
          {errors.photo && <p className="form-error">{errors.photo}</p>}
        </div>

        <div>
          <label className="label">First Name *</label>
          <input className={`input ${errors.first_name ? 'input-invalid' : ''}`} value={form.first_name} onChange={set('first_name')} />
          {errors.first_name && <p className="form-error">{errors.first_name}</p>}
        </div>
        <div>
          <label className="label">Last Name *</label>
          <input className={`input ${errors.last_name ? 'input-invalid' : ''}`} value={form.last_name} onChange={set('last_name')} />
          {errors.last_name && <p className="form-error">{errors.last_name}</p>}
        </div>
        <div>
          <label className="label">Email *</label>
          <input type="email" className={`input ${errors.email ? 'input-invalid' : ''}`} value={form.email} onChange={set('email')} />
          {errors.email && <p className="form-error">{errors.email}</p>}
        </div>
        <div>
          <label className="label">Phone</label>
          <input className={`input ${errors.phone ? 'input-invalid' : ''}`} value={form.phone} onChange={set('phone')} placeholder="+63 9XX XXX XXXX" />
          {errors.phone && <p className="form-error">{errors.phone}</p>}
        </div>
        <div className="sm:col-span-2">
          <label className="label">Address</label>
          <input className={`input ${errors.address ? 'input-invalid' : ''}`} value={form.address} onChange={set('address')} maxLength={255} />
          {errors.address && <p className="form-error">{errors.address}</p>}
        </div>
        <div>
          <label className="label">Date of Birth</label>
          <input
            type="date"
            className={`input ${errors.date_of_birth ? 'input-invalid' : ''}`}
            value={form.date_of_birth}
            onChange={set('date_of_birth')}
            max={new Date().toISOString().slice(0, 10)}
          />
          {errors.date_of_birth && <p className="form-error">{errors.date_of_birth}</p>}
        </div>
        <div>
          <label className="label">Gender</label>
          <select className="input" value={form.gender} onChange={set('gender')}>
            <option value="">Select gender</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="label">Emergency Contact Name</label>
          <input
            className={`input ${errors.emergency_contact_name ? 'input-invalid' : ''}`}
            value={form.emergency_contact_name}
            onChange={set('emergency_contact_name')}
          />
          {errors.emergency_contact_name && <p className="form-error">{errors.emergency_contact_name}</p>}
        </div>
        <div>
          <label className="label">Emergency Contact Phone</label>
          <input
            className={`input ${errors.emergency_contact_phone ? 'input-invalid' : ''}`}
            value={form.emergency_contact_phone}
            onChange={set('emergency_contact_phone')}
            placeholder="+63 9XX XXX XXXX"
          />
          {errors.emergency_contact_phone && <p className="form-error">{errors.emergency_contact_phone}</p>}
        </div>

        <div className="sm:col-span-2 rounded-xl border border-dashed border-primary/40 bg-pale-green p-4">
          <p className="text-sm font-semibold text-primary">Membership {member ? '(optional renewal)' : ''}</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Plan</label>
              <select className="input" value={form.plan_id} onChange={set('plan_id')}>
                <option value="">No plan</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} — ₱{plan.price}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Start Date</label>
              <input
                type="date"
                className={`input ${errors.membership_start_date ? 'input-invalid' : ''}`}
                value={form.membership_start_date}
                onChange={set('membership_start_date')}
              />
              {errors.membership_start_date && <p className="form-error">{errors.membership_start_date}</p>}
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={set('status')}>
                <option value="pending">Pending</option>
                <option value="active">Active</option>
                <option value="expired">Expired</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
          </div>
        </div>

        <div className="sm:col-span-2 mt-2 flex justify-end gap-3">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? <LoadingSpinner size="sm" /> : null}
            {saving ? 'Saving...' : member ? 'Update Member' : 'Create Member'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
