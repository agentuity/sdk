import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';
import type { MDXModule } from '../../../../components/docs/mdx-page';
import Content, { frontmatter, tableOfContents } from '../../../../content/reference/api/oauth.mdx';

const mdxModule = {
	default: Content,
	frontmatter,
	tableOfContents,
} satisfies MDXModule;

export const Route = createFileRoute('/_docs/reference/api/oauth')({
	component: () => <MDXPage module={mdxModule} />,
	staticData: { crumb: 'OAuth Applications' },
});
