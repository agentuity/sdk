import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';
import type { MDXModule } from '../../../components/docs/mdx-page';
import Content, { frontmatter, tableOfContents } from '../../../content/build/index.mdx';

const mdxModule = {
	default: Content,
	frontmatter,
	tableOfContents,
} satisfies MDXModule;

export const Route = createFileRoute('/_docs/build/')({
	component: () => <MDXPage module={mdxModule} />,
	staticData: { crumb: 'Build' },
});
