import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';
import type { MDXModule } from '../../../../components/docs/mdx-page';
import Content, {
	frontmatter,
	tableOfContents,
} from '../../../../content/build/agents/chat-and-streaming.mdx';

const mdxModule = {
	default: Content,
	frontmatter,
	tableOfContents,
} satisfies MDXModule;

export const Route = createFileRoute('/_docs/build/agents/chat-and-streaming')({
	component: () => <MDXPage module={mdxModule} />,
	staticData: { crumb: 'Chat and Streaming' },
});
