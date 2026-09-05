import { useState, useEffect, useCallback } from 'react';
import * as React from 'react';
import { apiGet, apiPost, apiGetBlobUrl } from '../lib/api';
import { AlertCircle, Check, X, FileText } from 'lucide-react';

interface AdminDocument {
  id: string;
  userId: string;
  vehicleId: string | null;
  kind: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  verificationStatus: string;
  reviewedAt: string | null;
  rejectionReason: string;
  createdAt: string;
  updatedAt: string;
}

const KIND_LABELS: Record<string, string> = {
  driving_license: 'گواهینامه رانندگی',
  vehicle_registration: 'سند وسیله نقلیه',
  safety_card: 'کارت معاینه فنی',
  national_id: 'کارت ملی',
  professional_card: 'کارت هوشمند',
  other: 'سایر',
};

const KIND_BADGES: Record<string, string> = {
  driving_license: 'bg-blue-100 text-blue-700',
  vehicle_registration: 'bg-purple-100 text-purple-700',
  safety_card: 'bg-orange-100 text-orange-700',
  national_id: 'bg-teal-100 text-teal-700',
  professional_card: 'bg-indigo-100 text-indigo-700',
  other: 'bg-gray-100 text-gray-600',
};

const STATUS_BADGES: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'در انتظار',
  approved: 'تأیید شده',
  rejected: 'رد شده',
};

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<AdminDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [previewError, setPreviewError] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      const qs = params.toString();
      const data = await apiGet<{ documents: AdminDocument[]; count: number }>(
        `/api/admin/documents${qs ? `?${qs}` : ''}`
      );
      setDocuments(data.documents);
    } catch {
      setError('خطا در دریافت اسناد');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);

  const handleApprove = async (doc: AdminDocument) => {
    if (!window.confirm(`آیا از تأیید سند "${doc.originalName || doc.kind}" اطمینان دارید؟`)) return;
    try {
      await apiPost(`/api/admin/documents/${doc.id}/verify`, { decision: 'approved' });
      fetchDocuments();
    } catch {
      setError('خطا در تأیید سند');
    }
  };

  const startReject = (doc: AdminDocument) => {
    setRejectingId(doc.id);
    setRejectReason('');
  };

  const cancelReject = () => {
    setRejectingId(null);
    setRejectReason('');
  };

  const confirmReject = async (docId: string) => {
    if (!rejectReason.trim()) return;
    try {
      await apiPost(`/api/admin/documents/${docId}/verify`, {
        decision: 'rejected',
        reason: rejectReason.trim(),
      });
      setRejectingId(null);
      setRejectReason('');
      fetchDocuments();
    } catch {
      setError('خطا در رد سند');
    }
  };

  const handlePreview = async (doc: { id: string; originalName: string }) => {
    try {
      const url = await apiGetBlobUrl(`/api/admin/documents/${doc.id}/file`);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setPreviewError(null);
    } catch {
      setPreviewError('فایلی برای این سند موجود نیست');
      setTimeout(() => setPreviewError(null), 4000);
    }
  };

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-red-50 p-4 text-sm text-red-600">
        <AlertCircle size={16} />
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-800">اسناد</h2>

      {/* Filter */}
      <div className="flex gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">همه وضعیت‌ها</option>
          <option value="pending">در انتظار</option>
          <option value="approved">تأیید شده</option>
          <option value="rejected">رد شده</option>
        </select>
      </div>

      {previewError && (
        <div className="flex items-center justify-between rounded-lg bg-red-50 p-3 text-sm text-red-600">
          <span className="flex items-center gap-2">
            <AlertCircle size={16} />
            {previewError}
          </span>
          <button
            onClick={() => setPreviewError(null)}
            type="button"
            className="rounded p-1 text-red-400 hover:bg-red-100"
            title="بستن"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-400">در حال بارگذاری...</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">نوع</th>
                <th className="px-4 py-3">فایل</th>
                <th className="px-4 py-3">کاربر</th>
                <th className="px-4 py-3">وضعیت</th>
                <th className="px-4 py-3">تاریخ</th>
                <th className="px-4 py-3">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {documents.map((doc) => (
                <React.Fragment key={doc.id}>
                  <tr className="bg-white">
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          KIND_BADGES[doc.kind] || 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {KIND_LABELS[doc.kind] || doc.kind}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {doc.originalName ? (
                        <button
                          onClick={() => handlePreview(doc)}
                          type="button"
                          className="flex items-center gap-1 text-blue-600 hover:underline"
                          title="مشاهده فایل"
                        >
                          <FileText size={14} className="text-gray-400" />
                          {doc.originalName}
                        </button>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {doc.userId.slice(0, 8)}...
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          STATUS_BADGES[doc.verificationStatus] || 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {STATUS_LABELS[doc.verificationStatus] || doc.verificationStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(doc.createdAt).toLocaleDateString('fa-IR')}
                    </td>
                    <td className="px-4 py-3">
                      {doc.verificationStatus === 'pending' && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleApprove(doc)}
                            className="rounded p-1 text-green-500 hover:bg-green-50"
                            title="تأیید"
                          >
                            <Check size={16} />
                          </button>
                          <button
                            onClick={() => startReject(doc)}
                            className="rounded p-1 text-red-500 hover:bg-red-50"
                            title="رد"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  {rejectingId === doc.id && (
                    <tr key={`${doc.id}-reject`} className="bg-gray-50">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
                          <h3 className="text-sm font-medium text-blue-800">دلیل رد سند</h3>
                          <textarea
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            rows={2}
                            placeholder="دلیل رد را وارد کنید..."
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => confirmReject(doc.id)}
                              disabled={!rejectReason.trim()}
                              className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                            >
                              <X size={14} />
                              رد سند
                            </button>
                            <button
                              onClick={cancelReject}
                              className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                            >
                              انصراف
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {documents.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-400">
                    سندی یافت نشد
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
