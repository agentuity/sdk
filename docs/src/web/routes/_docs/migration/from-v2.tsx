import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';
import type { MDXModule } from '../../../components/docs/mdx-page';
import Content, { frontmatter, tableOfContents } from '../../../content/migration/from-v2.mdx';

const mdxModule = {
	default: Content,
	frontmatter,
	tableOfContents,
} satisfies MDXModule;

export const Route = createFileRoute('/_docs/migration/from-v2')({
	component: () => <MDXPage module={mdxModule} />,
	staticData: { crumb: 'From v2' },
});
