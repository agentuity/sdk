import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';
import type { MDXModule } from '../../../components/docs/mdx-page';
import Content, {
	frontmatter,
	tableOfContents,
} from '../../../content/get-started/import-existing-app.mdx';

const mdxModule = {
	default: Content,
	frontmatter,
	tableOfContents,
} satisfies MDXModule;

export const Route = createFileRoute('/_docs/get-started/import-existing-app')({
	component: () => <MDXPage module={mdxModule} />,
	staticData: { crumb: 'Add to Existing App' },
});
