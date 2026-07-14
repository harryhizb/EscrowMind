import { Download, FileArchive } from 'lucide-react';
import { useMode } from '../context/useMode.js';
import EmptyState from '../components/EmptyState.jsx';
import Notice from '../components/Notice.jsx';

export default function Downloads() {
  const { isClientMode } = useMode();

  return (
    <div className="page-wrapper">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <p className="eyebrow">{isClientMode ? 'Client Mode' : 'Freelancer Mode'}</p>
          <h1 className="page-title flex items-center gap-2">
            <Download size={26} className="text-teal" />
            Downloads
          </h1>
          <p className="page-subtitle">
            {isClientMode
              ? 'Released freelancer deliverables from your completed jobs will appear here for download.'
              : 'Client reference documents and specification files from your assigned jobs will appear here.'}
          </p>
        </div>
      </div>

      {/* Context notice */}
      <Notice variant="info" label="Coming soon">
        {isClientMode
          ? 'Deliverable downloads are unlocked after a milestone is released. Real IPFS download lists and ZIP handlers are part of Sections 7 and 8.'
          : 'Spec downloads are available once you are assigned to a job. Real IPFS download lists and ZIP handlers are part of Sections 7 and 8.'}
      </Notice>

      {/* Empty state */}
      <div className="mt-4">
        <EmptyState
          icon={FileArchive}
          title="No downloads available"
          message={
            isClientMode
              ? 'Deliverable downloads are unlocked after you release a milestone.'
              : 'Specification files will appear here once you are assigned to a job.'
          }
        />
      </div>
    </div>
  );
}
