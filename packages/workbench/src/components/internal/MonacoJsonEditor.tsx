import React, { useEffect, useState } from 'react';
import Editor, { type Monaco, type OnMount } from '@monaco-editor/react';
import { useTheme } from '../ui/theme-provider';
import type { JSONSchema7 } from 'ai';

interface MonacoJsonEditorProps {
	value: string;
	onChange: (value: string) => void;
	schema?: JSONSchema7;
	schemaUri?: string;
	className?: string;
}

export function MonacoJsonEditor({
	value,
	onChange,
	schema,
	schemaUri = 'agentuity://schema/default',
	className = '',
}: MonacoJsonEditorProps) {
	const { theme } = useTheme();
	const [editorInstance, setEditorInstance] = useState<Parameters<OnMount>[0] | null>(null);
	const [monacoInstance, setMonacoInstance] = useState<Monaco | null>(null);
	const [editorHeight, setEditorHeight] = useState(120);

	// Get resolved theme (similar to useTheme's resolvedTheme from next-themes)
	const resolvedTheme = React.useMemo(() => {
		if (theme === 'system') {
			return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
		}
		return theme;
	}, [theme]);

	// Configure JSON schema when schema or monacoInstance changes
	useEffect(() => {
		if (!monacoInstance || !schema) return;

		const schemaObject = typeof schema === 'string' ? JSON.parse(schema) : schema;

		// Configure Monaco JSON language support for schema validation
		monacoInstance.languages.json.jsonDefaults.setDiagnosticsOptions({
			validate: true,
			schemas: [
				{
					uri: schemaUri,
					fileMatch: ['*'],
					schema: schemaObject,
				},
			],
		});
	}, [monacoInstance, schema, schemaUri]);

	// Handle theme changes for existing editor instance
	useEffect(() => {
		if (editorInstance && monacoInstance) {
			editorInstance.updateOptions({
				theme: resolvedTheme === 'light' ? 'custom-light' : 'custom-dark',
			});
		}
	}, [resolvedTheme, editorInstance, monacoInstance]);

	return (
		<div 
			className={`w-full pl-3 pb-3 [&_.monaco-editor]:!bg-transparent [&_.monaco-editor-background]:!bg-transparent [&_.view-lines]:!bg-transparent [&_.monaco-editor]:!shadow-none [&_.monaco-scrollable-element]:!shadow-none [&_.overflow-guard]:!shadow-none [&_.monaco-scrollable-element>.shadow.top]:!hidden [&_.monaco-editor_.scroll-decoration]:!hidden [&_.shadow.top]:!hidden [&_.scroll-decoration]:!hidden ${className}`}
			style={{ minHeight: '64px', maxHeight: '192px', height: `${editorHeight}px` }}
		>
			<Editor
				value={value || '{}'}
				onChange={(newValue) => onChange(newValue || '')}
				language="json"
				theme={resolvedTheme === 'light' ? 'custom-light' : 'custom-dark'}
				height="100%"
				options={{
					minimap: { enabled: false },
					lineNumbers: 'off',
					folding: false,
					scrollBeyondLastLine: false,
					wordWrap: 'on',
					renderLineHighlight: 'none',
					overviewRulerBorder: false,
					overviewRulerLanes: 0,
					hideCursorInOverviewRuler: true,
					fixedOverflowWidgets: true,
					roundedSelection: false,
					occurrencesHighlight: 'off',
					selectionHighlight: false,
					renderWhitespace: 'none',
					fontSize: 14,
					fontWeight: '400',
					formatOnPaste: true,
					formatOnType: true,
					autoIndent: 'full',
					glyphMargin: false,
					lineDecorationsWidth: 0,
					lineNumbersMinChars: 0,
					automaticLayout: true,
					scrollbar: {
						vertical: 'auto',
						horizontal: 'auto',
						verticalScrollbarSize: 10,
						horizontalScrollbarSize: 10,
						// Disable scroll shadows
						verticalHasArrows: false,
						horizontalHasArrows: false,
					},
					padding: { top: 12, bottom: 12 },
					// Additional background transparency options
					renderValidationDecorations: 'off',
					guides: {
						indentation: false,
						highlightActiveIndentation: false,
					},
					// Disable sticky scroll feature
					stickyScroll: { enabled: false },
					// Disable scroll decorations/shadows
					scrollBeyondLastColumn: 0,
					renderLineHighlightOnlyWhenFocus: true,
				}}
				onMount={(editor, monaco) => {
					setEditorInstance(editor);
					setMonacoInstance(monaco);
					editor.focus();

					// Auto-resize based on content
					const updateHeight = () => {
						const contentHeight = editor.getContentHeight();
						const maxHeight = 192; // max-h-48 = 12rem = 192px
						const minHeight = 64; // min-h-16 = 4rem = 64px
						const newHeight = Math.min(Math.max(contentHeight + 24, minHeight), maxHeight);
						setEditorHeight(newHeight);
						
						// Layout after height change
						setTimeout(() => editor.layout(), 0);
					};

					// Update height on content changes
					editor.onDidChangeModelContent(updateHeight);
					
					// Initial height update
					setTimeout(updateHeight, 0);

					// Ensure background transparency and remove shadows
					setTimeout(() => {
						const editorElement = editor.getDomNode();
						if (editorElement) {
							// Set transparent backgrounds on all relevant elements
							const elementsToMakeTransparent = [
								'.monaco-editor',
								'.monaco-editor .monaco-editor-background',
								'.monaco-editor .view-lines',
								'.monaco-editor .margin',
								'.monaco-editor .monaco-scrollable-element',
								'.monaco-editor .overflow-guard',
								'.view-overlays',
								'.decorationsOverviewRuler',
							];

							elementsToMakeTransparent.forEach(selector => {
								const element = editorElement.querySelector(selector);
								if (element) {
									(element as HTMLElement).style.backgroundColor = 'transparent';
									(element as HTMLElement).style.boxShadow = 'none';
								}
							});

							// Remove scroll shadows specifically - target the exact classes
							const shadowTop = editorElement.querySelector('.monaco-scrollable-element > .shadow.top');
							if (shadowTop) {
								(shadowTop as HTMLElement).style.display = 'none';
							}

							const scrollDecorations = editorElement.querySelectorAll('.monaco-editor .scroll-decoration, .scroll-decoration');
							scrollDecorations.forEach(decoration => {
								(decoration as HTMLElement).style.display = 'none';
							});

							const scrollableElement = editorElement.querySelector('.monaco-scrollable-element');
							if (scrollableElement) {
								(scrollableElement as HTMLElement).style.setProperty('--scroll-shadow', 'none');
								(scrollableElement as HTMLElement).style.setProperty('box-shadow', 'none', 'important');
							}

							// Also set transparent and remove shadow on the editor element itself
							(editorElement as HTMLElement).style.backgroundColor = 'transparent';
							(editorElement as HTMLElement).style.boxShadow = 'none';
						}
					}, 0);
				}}
				beforeMount={(monaco) => {
					setMonacoInstance(monaco);
					monaco.editor.defineTheme('custom-light', {
						base: 'vs',
						inherit: true,
						rules: [],
						colors: {
							'editor.background': '#00000000', // Transparent
							'editor.foreground': '#3F3F46',
						},
					});

					monaco.editor.defineTheme('custom-dark', {
						base: 'vs-dark',
						inherit: true,
						rules: [],
						colors: {
							'editor.background': '#00000000', // Transparent
							'editor.foreground': '#F4F4F5',
						},
					});
				}}
			/>
		</div>
	);
}
