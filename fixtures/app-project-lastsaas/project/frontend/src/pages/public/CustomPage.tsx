import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { brandingApi } from '../../api/client';
import type { CustomPage as CustomPageType } from '../../types';
import LoadingSpinner from '../../components/LoadingSpinner';

export default function CustomPage() {
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState<CustomPageType | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    brandingApi.getPublicPage(slug)
      .then(setPage)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (!page) return;
    const prevTitle = document.title;
    if (page.title) document.title = page.title;

    let metaDesc = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (page.metaDescription) {
      if (!metaDesc) {
        metaDesc = document.createElement('meta');
        metaDesc.name = 'description';
        document.head.appendChild(metaDesc);
      }
      metaDesc.content = page.metaDescription;
    }

    return () => {
      document.title = prevTitle;
      if (metaDesc && page.metaDescription) metaDesc.content = '';
    };
  }, [page]);

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (notFound || !page) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-2">404</h1>
          <p className="text-dark-400">Page not found</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-dark-950"
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(page.htmlBody) }}
    />
  );
}
