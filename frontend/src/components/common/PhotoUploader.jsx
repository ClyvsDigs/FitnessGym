import { Camera } from 'lucide-react'
import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { getInitials } from '@/utils/format'

export default function PhotoUploader({ name, preview, onChange, fullName }) {
  const inputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)

  const handleFile = (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be under 2 MB.')
      return
    }
    onChange(file)
  }

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          handleFile(e.dataTransfer.files?.[0])
        }}
        className={`relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-dashed transition-colors ${
          dragOver ? 'border-primary bg-pale-green' : 'border-secondary-text/40 bg-slate-100 hover:border-primary'
        }`}
        title="Click or drop an image"
      >
        {preview ? (
          <img src={preview} alt="Profile preview" className="h-full w-full object-cover" />
        ) : fullName ? (
          <span className="text-xl font-bold text-secondary-text">{getInitials(fullName)}</span>
        ) : (
          <Camera className="h-6 w-6 text-secondary-text" />
        )}
        <span className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white">
          <Camera className="h-3 w-3" />
        </span>
      </button>

      <div className="text-sm">
        <p className="font-medium text-main-text">Profile Photo</p>
        <p className="text-xs text-secondary-text">JPG or PNG, max 2 MB</p>
        <div className="mt-1.5 flex gap-2">
          <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => inputRef.current?.click()}>
            {preview ? 'Change' : 'Upload'}
          </button>
          {preview && (
            <button type="button" className="text-xs font-medium text-red-600 hover:underline" onClick={() => onChange(null)}>
              Remove
            </button>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        name={name}
        accept="image/png,image/jpeg,image/jpg,image/webp"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}
