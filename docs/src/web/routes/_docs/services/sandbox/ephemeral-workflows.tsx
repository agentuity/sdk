import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';
import type { MDXModule } from '../../../../components/docs/mdx-page';
import Content, {
	frontmatter,
	tableOfContents,
} from '../../../../content/services/sandbox/ephemeral-workflows.mdx';

const mdxModule = {
	default: Content,
	frontmatter,
	tableOfContents,
} satisfies MDXModule;

export const Route = createFileRoute('/_docs/services/sandbox/ephemeral-workflows')({
	component: () => <MDXPage module={mdxModule} />,
	staticData: { crumb: 'Ephemeral workflows' },
});
