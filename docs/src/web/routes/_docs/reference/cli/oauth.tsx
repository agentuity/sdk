import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';
import type { MDXModule } from '../../../../components/docs/mdx-page';
import Content, { frontmatter, tableOfContents } from '../../../../content/reference/cli/oauth.mdx';

const mdxModule = {
	default: Content,
	frontmatter,
	tableOfContents,
} satisfies MDXModule;

export const Route = createFileRoute('/_docs/reference/cli/oauth')({
	component: () => <MDXPage module={mdxModule} />,
	staticData: { crumb: 'Managing OAuth Apps' },
});
