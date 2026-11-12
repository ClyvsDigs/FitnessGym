import { Archive, Pencil, Plus, Search, Tag, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import EmptyState from '@/components/common/EmptyState'
import ErrorState from '@/components/common/ErrorState'
import LoadingSpinner from '@/components/common/LoadingSpinner'
import Modal from '@/components/common/Modal'
import Pagination from '@/components/common/Pagination'
import { TableSkeleton } from '@/components/common/Skeleton'
import StatusBadge from '@/components/common/StatusBadge'
import PageHeader from '@/components/layout/PageHeader'
import { useDebounce } from '@/hooks/useDebounce'
import { planService } from '@/services'
import { getErrorMessage } from '@/services/api'
import { formatCurrency } from '@/utils/format'

const typeLabels = { weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Annual' }

const initialForm = { name: '', description: '', type: 'monthly', duration_days: 30, price: '', benefits: '', status: 'active' }

export default function PlansPage() {
  const [plans, setPlans] = useState([])
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
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await planService.list({ search: search || undefined, status, page, per_page: 10 })
      setPlans(res.data.data)
      setMeta(res.data.meta)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [search, status, page])

  useEffect(() => { load() }, [load])

  useEffect(() => { setPage(1) }, [search, status])

  const openForm = (plan = null) => {
    setEditing(plan)
    setErrors({})
    setForm(
      plan
        ? {
            name: plan.name,
            description: plan.description || '',
            type: plan.type,
            duration_days: plan.duration_days,
            price: plan.price,
            benefits: (plan.benefits || []).join('\n'),
            status: plan.status,
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
    if (!form.name.trim()) next.name = 'Plan name is required.'
    else if (form.name.length > 255) next.name = 'Plan name must be 255 characters or fewer.'
    if (form.description && form.description.length > 2000) next.description = 'Description must be 2000 characters or fewer.'
    if (!['weekly', 'monthly', 'quarterly', 'annual'].includes(form.type)) next.type = 'Select a valid plan type.'
    const duration = Number(form.duration_days)
    if (!form.duration_days || Number.isNaN(duration) || duration < 1) next.duration_days = 'Duration must be at least 1 day.'
    const price = Number(form.price)
    if (form.price === '' || Number.isNaN(price)) next.price = 'Price is required.'
    else if (price < 0) next.price = 'Price cannot be negative.'
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
      const payload = {
        ...form,
        duration_days: Number(form.duration_days),
        price: Number(form.price),
        benefits: form.benefits.split('\n').map((b) => b.trim()).filter(Boolean),
      }
      if (editing) {
        await planService.update(editing.id, payload)
        toast.success('Plan updated')
      } else {
        await planService.create(payload)
        toast.success('Plan created')
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
      const res = await planService.delete(deleting.id)
      toast.success(res.data.message || 'Plan deleted')
      setDeleting(null)
      load()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  return (
    <div>
      <PageHeader title="Membership Plans" subtitle="Create and manage gym membership plans.">
        <button className="btn-primary" onClick={() => openForm()}>
          <Plus className="h-4.5 w-4.5" /> Add Plan
        </button>
      </PageHeader>

      <div className="card mb-6 flex flex-col gap-3 p-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-secondary-text" />
          <input className="input !pl-11" placeholder="Search plans..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </div>
        <select className="input !w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : loading ? (
          <TableSkeleton rows={5} cols={6} />
        ) : plans.length === 0 ? (
          <EmptyState icon={Tag} title="No plans found" description="Create your first membership plan." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border-color">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="table-th">Plan</th>
                    <th className="table-th">Type</th>
                    <th className="table-th">Duration</th>
                    <th className="table-th">Price</th>
                    <th className="table-th">Members</th>
                    <th className="table-th">Status</th>
                    <th className="table-th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-color">
                  {plans.map((plan) => (
                    <tr key={plan.id} className="hover:bg-slate-50">
                      <td className="table-td">
                        <p className="font-medium text-main-text">{plan.name}</p>
                        <p className="max-w-xs truncate text-xs text-secondary-text">{plan.description}</p>
                      </td>
                      <td className="table-td">{typeLabels[plan.type]}</td>
                      <td className="table-td">{plan.duration_days} days</td>
                      <td className="table-td font-semibold">{formatCurrency(plan.price)}</td>
                      <td className="table-td">{plan.memberships_count ?? 0}</td>
                      <td className="table-td"><StatusBadge status={plan.status} /></td>
                      <td className="table-td">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => openForm(plan)} className="rounded-lg p-2 text-secondary-text hover:bg-amber-50 hover:text-amber-600" title="Edit">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button onClick={() => setDeleting(plan)} className="rounded-lg p-2 text-secondary-text hover:bg-red-50 hover:text-red-600" title={plan.status === 'active' ? 'Archive' : 'Delete'}>
                            {plan.status === 'active' ? <Archive className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
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

      <Modal open={formOpen} title={editing ? 'Edit Plan' : 'Add Plan'} onClose={() => !saving && setFormOpen(false)}>
        <form onSubmit={submit} noValidate className="space-y-4">
          <div>
            <label className="label">Plan Name *</label>
            <input
              className={`input ${errors.name ? 'input-invalid' : ''}`}
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              maxLength={255}
            />
            {errors.name && <p className="form-error">{errors.name}</p>}
          </div>
          <div>
            <label className="label">Description</label>
            <textarea
              className={`input ${errors.description ? 'input-invalid' : ''}`}
              rows={2}
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
              maxLength={2000}
            />
            {errors.description && <p className="form-error">{errors.description}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Type *</label>
              <select
                className={`input ${errors.type ? 'input-invalid' : ''}`}
                value={form.type}
                onChange={(e) => setField('type', e.target.value)}
              >
                {Object.entries(typeLabels).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
              {errors.type && <p className="form-error">{errors.type}</p>}
            </div>
            <div>
              <label className="label">Duration (days) *</label>
              <input
                type="number"
                min="1"
                className={`input ${errors.duration_days ? 'input-invalid' : ''}`}
                value={form.duration_days}
                onChange={(e) => setField('duration_days', e.target.value)}
              />
              {errors.duration_days && <p className="form-error">{errors.duration_days}</p>}
            </div>
            <div>
              <label className="label">Price *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className={`input ${errors.price ? 'input-invalid' : ''}`}
                value={form.price}
                onChange={(e) => setField('price', e.target.value)}
              />
              {errors.price && <p className="form-error">{errors.price}</p>}
            </div>
          </div>
          <div>
            <label className="label">Benefits (one per line)</label>
            <textarea className="input" rows={4} value={form.benefits} onChange={(e) => setField('benefits', e.target.value)} placeholder={'Gym floor access\nGroup classes'} />
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status} onChange={(e) => setField('status', e.target.value)}>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? <LoadingSpinner size="sm" /> : null}
              {saving ? 'Saving...' : editing ? 'Update Plan' : 'Create Plan'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title={deleting?.status === 'active' ? 'Archive Plan' : 'Delete Plan'}
        message={
          deleting?.status === 'active'
            ? `"${deleting?.name}" has active members and will be archived instead of deleted. Continue?`
            : `Permanently delete "${deleting?.name}"?`
        }
        confirmLabel={deleting?.status === 'active' ? 'Archive' : 'Delete'}
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
