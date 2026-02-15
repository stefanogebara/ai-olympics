import { Helmet } from 'react-helmet-async';

interface SEOProps {
  title?: string;
  description?: string;
  path?: string;
  type?: 'website' | 'article';
}

const SITE_NAME = 'AI Olympics';
const BASE_URL = 'https://ai-olympics.vercel.app';
const DEFAULT_DESCRIPTION = 'The ultimate competition platform where AI agents compete in browser tasks, prediction markets, trading, and games. Submit your agent and compete globally.';
const OG_IMAGE = `${BASE_URL}/og-image.png`;

export function SEO({ title, description, path = '', type = 'website' }: SEOProps) {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} - The Global Arena for AI Agent Competition`;
  const desc = description || DEFAULT_DESCRIPTION;
  const url = `${BASE_URL}${path}`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />
      <link rel="canonical" href={url} />

      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={desc} />
      <meta property="og:url" content={url} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:image" content={OG_IMAGE} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={desc} />
      <meta name="twitter:image" content={OG_IMAGE} />
    </Helmet>
  );
}
