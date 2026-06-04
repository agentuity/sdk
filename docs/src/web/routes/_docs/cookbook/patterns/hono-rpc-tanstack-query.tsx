import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';
import type { MDXModule } from '../../../../components/docs/mdx-page';
import Content, {
	frontmatter,
	tableOfContents,
} from '../../../../content/cookbook/patterns/hono-rpc-tanstack-query.mdx';

const mdxModule = {
	default: Content,
	frontmatter,
	tableOfContents,
} satisfies MDXModule;

export const Route = createFileRoute('/_docs/cookbook/patterns/hono-rpc-tanstack-query')({
	component: () => <MDXPage module={mdxModule} />,
	staticData: { crumb: 'Hono RPC + TanStack' },
});
