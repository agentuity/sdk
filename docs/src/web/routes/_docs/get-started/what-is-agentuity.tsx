import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';
import type { MDXModule } from '../../../components/docs/mdx-page';
import Content, {
	frontmatter,
	tableOfContents,
} from '../../../content/get-started/what-is-agentuity.mdx';

const mdxModule = {
	default: Content,
	frontmatter,
	tableOfContents,
} satisfies MDXModule;

export const Route = createFileRoute('/_docs/get-started/what-is-agentuity')({
	component: () => <MDXPage module={mdxModule} />,
	staticData: { crumb: 'What is Agentuity?' },
});
