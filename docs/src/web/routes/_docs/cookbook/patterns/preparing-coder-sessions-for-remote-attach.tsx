import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';
import type { MDXModule } from '../../../../components/docs/mdx-page';
import Content, {
	frontmatter,
	tableOfContents,
} from '../../../../content/cookbook/patterns/preparing-coder-sessions-for-remote-attach.mdx';

const mdxModule = {
	default: Content,
	frontmatter,
	tableOfContents,
} satisfies MDXModule;

export const Route = createFileRoute(
	'/_docs/cookbook/patterns/preparing-coder-sessions-for-remote-attach'
)({
	component: () => <MDXPage module={mdxModule} />,
	staticData: { crumb: 'Reconnect Sessions' },
});
