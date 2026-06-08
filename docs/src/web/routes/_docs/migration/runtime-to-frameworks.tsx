import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';
import type { MDXModule } from '../../../components/docs/mdx-page';
import Content, {
	frontmatter,
	tableOfContents,
} from '../../../content/migration/runtime-to-frameworks.mdx';

const mdxModule = {
	default: Content,
	frontmatter,
	tableOfContents,
} satisfies MDXModule;

export const Route = createFileRoute('/_docs/migration/runtime-to-frameworks')({
	component: () => <MDXPage module={mdxModule} />,
	staticData: { crumb: 'Runtime to Frameworks' },
});
