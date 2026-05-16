'use client';

import { useState, useEffect } from 'react';
import { PageHeader, Card, Button, Modal, StatusBadge, EmptyState, showToast, ConfirmDialog } from '@/components/ui';
import { useRequireAuth } from '@/lib/hooks';
import { formatDate } from '@/lib/utils/format';
import apiClient from '@/lib/api';
import { ChevronRight } from 'lucide-react';

interface EvidenceDocument {
  id: string;
  evidence_type: 'training_cert' | 'policy_doc' | 'meeting_notes' | 'audit_evidence' | 'other';
  title: string;
  description: string;
  file_path: string;
  uploaded_by: string;
  verified: boolean;
  verified_by?: string;
  linked_alert_id?: string;
  linked_breach_id?: string;
  created_at: string;
}

type ViewMode = 'grid' | 'list';
type FilterCategory = 'all' | 'training_cert' | 'policy_doc' | 'meeting_notes' | 'audit_evidence' | 'other';
type FilterVerification = 'all' | 'verified' | 'unverified';

export default function EvidencePage() {
  useRequireAuth();

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('all');
  const [filterVerification, setFilterVerification] = useState<FilterVerification>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentTitle, setDocumentTitle] = useState('');
  const [documentCategory, setDocumentCategory] = useState<EvidenceDocument['evidence_type']>('training_cert');
  const [linkedAlertId, setLinkedAlertId] = useState('');
  const [linkedBreachId, setLinkedBreachId] = useState('');
  const [description, setDescription] = useState('');

  const [documents, setDocuments] = useState<EvidenceDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isVerifying, setIsVerifying] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Fetch evidence documents on mount
  useEffect(() => {
    const fetchDocuments = async () => {
      setIsLoading(true);
      setIsError(false);
      setErrorMessage('');
      try {
        const response = await apiClient.get('/compliance/evidence');
        setDocuments(Array.isArray(response.data) ? response.data : []);
      } catch (err: any) {
        console.error('Failed to load evidence documents:', err);
        setIsError(true);
        setErrorMessage(err.message || 'Failed to load evidence documents');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDocuments();
  }, []);

  const filteredDocuments = documents.filter(doc => {
    const matchesCategory = filterCategory === 'all' || doc.evidence_type === filterCategory;
    const matchesVerification =
      filterVerification === 'all' ||
      (filterVerification === 'verified' && doc.verified) ||
      (filterVerification === 'unverified' && !doc.verified);
    const matchesSearch =
      searchQuery === '' ||
      (doc.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (doc.description || '').toLowerCase().includes(searchQuery.toLowerCase());

    return matchesCategory && matchesVerification && matchesSearch;
  });

  const getCategoryLabel = (type: EvidenceDocument['evidence_type']) => {
    const labels: Record<EvidenceDocument['evidence_type'], string> = {
      training_cert: 'Training Certificate',
      policy_doc: 'Policy Document',
      meeting_notes: 'Meeting Notes',
      audit_evidence: 'Audit Evidence',
      other: 'Other',
    };
    return labels[type];
  };

  const handleUpload = async () => {
    if (!selectedFile || !documentTitle) {
      showToast('Please provide a title and select a file', 'error');
      setErrorMessage('Please provide a title and select a file');
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('evidence_type', documentCategory);
      formData.append('title', documentTitle);
      formData.append('description', description);
      if (linkedAlertId) formData.append('linked_alert_id', linkedAlertId);
      if (linkedBreachId) formData.append('linked_breach_id', linkedBreachId);

      await apiClient.post('/compliance/evidence', formData);

      showToast('Evidence uploaded successfully', 'success');
      // Refresh the document list
      const response = await apiClient.get('/compliance/evidence');
      setDocuments(Array.isArray(response.data) ? response.data : []);

      // Reset form
      setShowUploadModal(false);
      setSelectedFile(null);
      setDocumentTitle('');
      setDescription('');
      setDocumentCategory('training_cert');
      setLinkedAlertId('');
      setLinkedBreachId('');
      setErrorMessage('');
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to upload evidence';
      showToast(errorMsg, 'error');
      setErrorMessage(errorMsg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleVerify = async (evidenceId: string) => {
    setIsVerifying(evidenceId);
    try {
      await apiClient.post(`/compliance/evidence/${evidenceId}/verify`, {});

      showToast('Evidence verified successfully', 'success');
      // Refresh the document list
      const response = await apiClient.get('/compliance/evidence');
      setDocuments(Array.isArray(response.data) ? response.data : []);
      setErrorMessage('');
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to verify evidence';
      showToast(errorMsg, 'error');
      setErrorMessage(errorMsg);
    } finally {
      setIsVerifying(null);
    }
  };

  const handleDownload = async (evidenceId: string, title: string) => {
    try {
      const response = await apiClient.get(`/compliance/evidence/${evidenceId}/download`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      // Extract filename from content-disposition header or fallback to title
      const contentDisposition = response.headers?.['content-disposition'];
      let filename = title;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?(.+?)"?$/);
        if (match) filename = match[1];
      }
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      showToast(err.message || 'Failed to download file', 'error');
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Evidence Locker"
        description="Centralized document storage for compliance evidence, training certificates, and audit records"
      />

      <Card className="rounded-xl">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold uppercase tracking-wide text-gray-900">Documents</h2>
            <div className="flex gap-2">
              <Button
                variant={viewMode === 'grid' ? 'primary' : 'secondary'}
                onClick={() => setViewMode('grid')}
                className="w-10 h-10 p-0"
              >
                ⊞
              </Button>
              <Button
                variant={viewMode === 'list' ? 'primary' : 'secondary'}
                onClick={() => setViewMode('list')}
                className="w-10 h-10 p-0"
              >
                ≡
              </Button>
              <Button onClick={() => setShowUploadModal(true)}>
                Upload Evidence
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <input
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value as FilterCategory)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              >
                <option value="all">All Categories</option>
                <option value="training_cert">Training Certificate</option>
                <option value="policy_doc">Policy Document</option>
                <option value="meeting_notes">Meeting Notes</option>
                <option value="audit_evidence">Audit Evidence</option>
                <option value="other">Other</option>
              </select>

              <select
                value={filterVerification}
                onChange={(e) => setFilterVerification(e.target.value as FilterVerification)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              >
                <option value="all">All Verification Status</option>
                <option value="verified">Verified Only</option>
                <option value="unverified">Unverified Only</option>
              </select>
            </div>
          </div>
        </div>

        <div className="p-6">
          {isError && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{errorMessage}</p>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-500 mb-4"></div>
                <p className="text-gray-600">Loading documents...</p>
              </div>
            </div>
          ) : filteredDocuments.length > 0 ? (
            viewMode === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredDocuments.map(doc => (
                  <div key={doc.id} className="group border border-gray-200 rounded-xl p-4 hover:shadow-lg hover:border-gray-300 transition-all">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-gray-900 flex-1 line-clamp-2">{doc.title}</h3>
                      {doc.verified && <StatusBadge status="success" label="Verified" />}
                    </div>
                    <p className="text-sm text-gray-600 mb-3 uppercase tracking-wide text-xs font-medium">{getCategoryLabel(doc.evidence_type)}</p>
                    <div className="space-y-1 text-xs text-gray-500 mb-4">
                      {doc.description && <p className="line-clamp-2">{doc.description}</p>}
                      <p className="tabular-nums">{formatDate(new Date(doc.created_at))}</p>
                      <p>By: {doc.uploaded_by}</p>
                      {doc.verified_by && <p>Verified by {doc.verified_by}</p>}
                      {doc.linked_alert_id && <p>Alert ID: {doc.linked_alert_id}</p>}
                      {doc.linked_breach_id && <p>Breach ID: {doc.linked_breach_id}</p>}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="secondary" className="flex-1 text-sm" onClick={() => handleDownload(doc.id, doc.title)}>
                        Download
                      </Button>
                      {!doc.verified && (
                        <Button
                          variant="primary"
                          className="flex-1 text-sm"
                          onClick={() => handleVerify(doc.id)}
                          disabled={isVerifying === doc.id}
                        >
                          {isVerifying === doc.id ? 'Verifying...' : 'Verify'}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        className="text-xs px-2 py-1 text-red-600 hover:bg-red-50"
                        onClick={() => setConfirmDelete(doc.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredDocuments.map(doc => (
                  <div key={doc.id} className="group flex items-center justify-between p-4 border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900 line-clamp-2">{doc.title}</h3>
                        {doc.verified && <StatusBadge status="success" label="Verified" />}
                      </div>
                      <div className="flex gap-4 mt-1 text-sm text-gray-600 flex-wrap">
                        <span className="uppercase tracking-wide text-xs font-medium text-gray-500">{getCategoryLabel(doc.evidence_type)}</span>
                        <span className="tabular-nums">{formatDate(new Date(doc.created_at))}</span>
                        <span>By: {doc.uploaded_by}</span>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <Button variant="secondary" className="text-sm" onClick={() => handleDownload(doc.id, doc.title)}>
                        Download
                      </Button>
                      {!doc.verified && (
                        <Button
                          variant="primary"
                          className="text-sm"
                          onClick={() => handleVerify(doc.id)}
                          disabled={isVerifying === doc.id}
                        >
                          {isVerifying === doc.id ? 'Verifying...' : 'Verify'}
                        </Button>
                      )}
                      <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-gray-600 self-center flex-shrink-0 transition-colors" />
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <EmptyState
              title="No documents found"
              description="Try adjusting your filters or upload a new document"
            />
          )}
        </div>
      </Card>

      <Modal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        title="Upload Evidence"
      >
        <div className="space-y-4">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{errorMessage}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Document Title *
            </label>
            <input
              type="text"
              value={documentTitle}
              onChange={(e) => setDocumentTitle(e.target.value)}
              placeholder="e.g., AML Training Certificate 2025"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Category *
            </label>
            <select
              value={documentCategory}
              onChange={(e) => setDocumentCategory(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="training_cert">Training Certificate</option>
              <option value="policy_doc">Policy Document</option>
              <option value="meeting_notes">Meeting Notes</option>
              <option value="audit_evidence">Audit Evidence</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional: Additional details about this evidence"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Linked Alert ID (Optional)
            </label>
            <input
              type="text"
              value={linkedAlertId}
              onChange={(e) => setLinkedAlertId(e.target.value)}
              placeholder="e.g., ALERT-12345"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Linked Breach ID (Optional)
            </label>
            <input
              type="text"
              value={linkedBreachId}
              onChange={(e) => setLinkedBreachId(e.target.value)}
              placeholder="e.g., BREACH-12345"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              File Upload *
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <input
                type="file"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <p className="text-gray-600">
                  {selectedFile ? selectedFile.name : 'Click to select or drag file'}
                </p>
              </label>
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-4">
            <Button
              variant="secondary"
              onClick={() => {
                setShowUploadModal(false);
                setErrorMessage('');
              }}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={isUploading}
            >
              {isUploading ? 'Uploading...' : 'Upload Document'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!confirmDelete}
        onConfirm={() => {
          if (confirmDelete) {
            setDocuments(documents.filter(doc => doc.id !== confirmDelete));
            showToast('Evidence deleted successfully', 'success');
          }
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
        title="Delete Evidence"
        message="This will permanently remove the evidence document. This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
