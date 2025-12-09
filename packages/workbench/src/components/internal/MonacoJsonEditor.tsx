import React, { useEffect, useState } from 'react';
import Editor, { type Monaco, type OnMount } from '@monaco-editor/react';
import { useTheme } from '../ui/theme-provider';
import { bundledThemes } from 'shiki';
import type { JSONSchema7 } from 'ai';

interface MonacoJsonEditorProps {
	value: string;
	onChange: (value: string) => void;
	schema?: JSONSchema7;
	schemaUri?: string;
	className?: string;
}

// Convert color value to valid hex for Monaco
function normalizeColorForMonaco(color: string | undefined, isDark: boolean): string {
	if (!color) return isDark ? 'abb2bf' : '383a42'; // Default foreground colors

	// Remove # prefix if present
	let normalized = color.replace('#', '');

	// Handle common color names that might appear in themes
	const colorMap: Record<string, string> = {
		white: isDark ? 'ffffff' : '383a42',
		black: isDark ? '000000' : 'abb2bf',
		red: 'e45649',
		green: '50a14f',
		blue: '4078f2',
		yellow: '986801',
		cyan: '0184bc',
		magenta: 'a626a4',
	};

	if (colorMap[normalized.toLowerCase()]) {
		normalized = colorMap[normalized.toLowerCase()];
	}

	// Validate it's a proper hex color (3 or 6 characters)
	if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(normalized)) {
		return isDark ? 'abb2bf' : '383a42'; // Fallback to default
	}

	return normalized;
}

// Convert Shiki theme to Monaco theme
function convertShikiToMonaco(
	shikiTheme: {
		colors?: Record<string, string>;
		tokenColors?: Array<{
			scope?: string | string[];
			settings?: { foreground?: string; fontStyle?: string };
		}>;
	},
	themeName: string
) {
	const colors = shikiTheme.colors || {};
	const tokenColors = shikiTheme.tokenColors || [];
	const isDark = themeName.includes('dark');

	// Convert token colors to Monaco rules
	const rules: Array<{ token: string; foreground: string; fontStyle?: string }> = [];
	tokenColors.forEach((tokenColor) => {
		if (tokenColor.scope && tokenColor.settings?.foreground) {
			const scopes = Array.isArray(tokenColor.scope) ? tokenColor.scope : [tokenColor.scope];
			scopes.forEach((scope: string) => {
				// Map common scopes to Monaco tokens
				let token = scope;
				if (scope.includes('string.quoted.double.json')) token = 'string.value.json';
				if (scope.includes('support.type.property-name.json')) token = 'string.key.json';
				if (scope.includes('constant.numeric.json')) token = 'number.json';
				if (scope.includes('constant.language.json')) token = 'keyword.json';
				if (scope.includes('punctuation.definition.string.json'))
					token = 'delimiter.bracket.json';

				const normalizedColor = normalizeColorForMonaco(
					tokenColor.settings?.foreground,
					isDark
				);

				rules.push({
					token,
					foreground: normalizedColor,
					fontStyle: tokenColor.settings?.fontStyle || undefined,
				});
			});
		}
	});

	return {
		base: isDark ? 'vs-dark' : 'vs',
		inherit: true,
		rules,
		colors: {
			'editor.background': '#00000000', // Always transparent
			'editor.foreground': normalizeColorForMonaco(colors['editor.foreground'], isDark),
		},
	};
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

							elementsToMakeTransparent.forEach((selector) => {
								const element = editorElement.querySelector(selector);
								if (element) {
									(element as HTMLElement).style.backgroundColor = 'transparent';
									(element as HTMLElement).style.boxShadow = 'none';
								}
							});

							// Remove scroll shadows specifically - target the exact classes
							const shadowTop = editorElement.querySelector(
								'.monaco-scrollable-element > .shadow.top'
							);
							if (shadowTop) {
								(shadowTop as HTMLElement).style.display = 'none';
							}

							const scrollDecorations = editorElement.querySelectorAll(
								'.monaco-editor .scroll-decoration, .scroll-decoration'
							);
							scrollDecorations.forEach((decoration) => {
								(decoration as HTMLElement).style.display = 'none';
							});

							const scrollableElement = editorElement.querySelector(
								'.monaco-scrollable-element'
							);
							if (scrollableElement) {
								(scrollableElement as HTMLElement).style.setProperty(
									'--scroll-shadow',
									'none'
								);
								(scrollableElement as HTMLElement).style.setProperty(
									'box-shadow',
									'none',
									'important'
								);
							}

							// Also set transparent and remove shadow on the editor element itself
							(editorElement as HTMLElement).style.backgroundColor = 'transparent';
							(editorElement as HTMLElement).style.boxShadow = 'none';
						}
					}, 0);
				}}
				beforeMount={async (monaco) => {
					setMonacoInstance(monaco);

					try {
						// Try to use actual Shiki themes
						const oneLightThemeModule = await bundledThemes['one-light']();
						const oneDarkProThemeModule = await bundledThemes['one-dark-pro']();

						if (oneLightThemeModule?.default) {
							const lightMonacoTheme = convertShikiToMonaco(
								oneLightThemeModule.default,
								'one-light'
							);
							monaco.editor.defineTheme('custom-light', lightMonacoTheme);
						}

						if (oneDarkProThemeModule?.default) {
							const darkMonacoTheme = convertShikiToMonaco(
								oneDarkProThemeModule.default,
								'one-dark-pro'
							);
							monaco.editor.defineTheme('custom-dark', darkMonacoTheme);
						}
					} catch (error) {
						console.warn(
							'Failed to load Shiki themes, falling back to manual themes:',
							error
						);

						// Fallback to manual theme definitions
						monaco.editor.defineTheme('custom-light', {
							base: 'vs',
							inherit: true,
							rules: [
								{ token: 'string.key.json', foreground: 'e45649' },
								{ token: 'string.value.json', foreground: '50a14f' },
								{ token: 'number.json', foreground: '986801' },
								{ token: 'keyword.json', foreground: '986801' },
								{ token: 'string', foreground: '50a14f' },
								{ token: 'number', foreground: '986801' },
								{ token: 'keyword', foreground: '986801' },
							],
							colors: {
								'editor.background': '#00000000',
								'editor.foreground': '#383a42',
							},
						});

						monaco.editor.defineTheme('custom-dark', {
							base: 'vs-dark',
							inherit: true,
							rules: [
								{ token: 'string.key.json', foreground: 'e06c75' },
								{ token: 'string.value.json', foreground: '98c379' },
								{ token: 'number.json', foreground: 'd19a66' },
								{ token: 'keyword.json', foreground: 'c678dd' },
								{ token: 'string', foreground: '98c379' },
								{ token: 'number', foreground: 'd19a66' },
								{ token: 'keyword', foreground: 'c678dd' },
							],
							colors: {
								'editor.background': '#00000000',
								'editor.foreground': '#abb2bf',
							},
						});
					}
				}}
			/>
		</div>
	);
}
