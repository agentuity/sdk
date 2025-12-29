import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";
import oneDarkProModule from "@shikijs/themes/dark-plus";
import oneLightModule from "@shikijs/themes/light-plus";
import type { JSONSchema7 } from "ai";
import type * as monaco from "monaco-editor";
import React, { useEffect, useRef, useState } from "react";
import type { ThemeRegistration } from "shiki";
import { useTheme } from "../ui/theme-provider";

interface JsonEditorProps {
	"aria-invalid"?: boolean;
	className?: string;
	onChange: (value: string) => void;
	onSubmit: () => void;
	onValidationChange?: (hasErrors: boolean) => void;
	schema?: JSONSchema7;
	schemaUri?: string;
	value: string;
}

// Convert color value to valid hex for Monaco
function normalizeColorForMonaco(
	color: string | undefined,
	isDark: boolean,
): string {
	if (!color) return isDark ? "abb2bf" : "383a42"; // Default foreground colors

	// Remove # prefix if present
	let normalized = color.replace("#", "");

	// Handle common color names that might appear in themes
	const colorMap: Record<string, string> = {
		white: isDark ? "ffffff" : "383a42",
		black: isDark ? "000000" : "abb2bf",
		red: "e45649",
		green: "50a14f",
		blue: "4078f2",
		yellow: "986801",
		cyan: "0184bc",
		magenta: "a626a4",
	};

	if (colorMap[normalized.toLowerCase()]) {
		normalized = colorMap[normalized.toLowerCase()];
	}

	// Validate it's a proper hex color (3 or 6 characters)
	if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(normalized)) {
		return isDark ? "abb2bf" : "383a42"; // Fallback to default
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
	themeName: string,
) {
	const colors = shikiTheme.colors || {};
	const tokenColors = shikiTheme.tokenColors || [];
	const isDark = themeName.includes("dark");

	// Convert token colors to Monaco rules
	const rules: Array<{
		token: string;
		foreground: string;
		fontStyle?: string;
	}> = [];
	tokenColors.forEach((tokenColor) => {
		if (tokenColor.scope && tokenColor.settings?.foreground) {
			const scopes = Array.isArray(tokenColor.scope)
				? tokenColor.scope
				: [tokenColor.scope];
			scopes.forEach((scope: string) => {
				// Map common scopes to Monaco tokens
				let token = scope;
				if (scope.includes("string.quoted.double.json"))
					token = "string.value.json";
				if (scope.includes("support.type.property-name.json"))
					token = "string.key.json";
				if (scope.includes("constant.numeric.json")) token = "number.json";
				if (scope.includes("constant.language.json")) token = "keyword.json";
				if (scope.includes("punctuation.definition.string.json"))
					token = "delimiter.bracket.json";

				const normalizedColor = normalizeColorForMonaco(
					tokenColor.settings?.foreground,
					isDark,
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
		base: (isDark ? "vs-dark" : "vs") as "vs" | "vs-dark",
		inherit: true,
		rules,
		colors: {
			"editor.background": "#00000000", // Always transparent
			"editor.foreground": normalizeColorForMonaco(
				colors["editor.foreground"],
				isDark,
			),
		},
	};
}

export function JsonEditor({
	"aria-invalid": ariaInvalid,
	className = "",
	onChange,
	onSubmit,
	onValidationChange,
	schema,
	schemaUri = "agentuity://schema/default",
	value,
}: JsonEditorProps) {
	const { theme } = useTheme();
	const [editorInstance, setEditorInstance] = useState<
		Parameters<OnMount>[0] | null
	>(null);
	const [monacoInstance, setMonacoInstance] = useState<Monaco | null>(null);
	const [editorHeight, setEditorHeight] = useState(120);
	const handleSubmit = useRef(onSubmit);

	useEffect(() => {
		handleSubmit.current = onSubmit;
	}, [onSubmit]);

	// Get resolved theme (similar to useTheme's resolvedTheme from next-themes)
	const resolvedTheme = React.useMemo(() => {
		if (theme === "system") {
			return window.matchMedia("(prefers-color-scheme: dark)").matches
				? "dark"
				: "light";
		}
		return theme;
	}, [theme]);

	// Configure JSON schema when schema or monacoInstance changes
	useEffect(() => {
		if (!monacoInstance || !schema) {
			return;
		}

		const schemaObject =
			typeof schema === "string" ? JSON.parse(schema) : schema;

		// Configure Monaco JSON language support for schema validation
		monacoInstance.languages.json.jsonDefaults.setDiagnosticsOptions({
			validate: true,
			allowComments: false,
			schemas: [
				{
					uri: schemaUri,
					fileMatch: ["*"],
					schema: schemaObject,
				},
			],
			enableSchemaRequest: true,
			schemaRequest: "error",
			schemaValidation: "error",
		});
	}, [monacoInstance, schema, schemaUri]);

	// Handle theme changes for existing editor instance
	useEffect(() => {
		if (editorInstance && monacoInstance) {
			editorInstance.updateOptions({
				theme: resolvedTheme === "light" ? "custom-light" : "custom-dark",
			});
		}
	}, [resolvedTheme, editorInstance, monacoInstance]);

	return (
		<div
			data-slot="input-group-control"
			aria-invalid={ariaInvalid}
			className={`w-full pl-3 pb-3 [&_.monaco-editor]:bg-transparent! [&_.monaco-editor-background]:bg-transparent! [&_.view-lines]:bg-transparent! [&_.monaco-editor]:shadow-none! [&_.monaco-scrollable-element]:shadow-none! [&_.overflow-guard]:shadow-none! [&_.monaco-scrollable-element>.shadow.top]:hidden! [&_.monaco-editor_.scroll-decoration]:hidden! [&_.shadow.top]:hidden! [&_.scroll-decoration]:hidden! [&_.native-edit-context]:outline-gray-200! [&_.native-edit-context]:dark:outline-gray-800! ${className}`}
			style={{
				minHeight: "64px",
				maxHeight: "192px",
				height: `${editorHeight}px`,
			}}
		>
			<Editor
				// Allow the editor to be truly empty. We intentionally do NOT coerce to `{}`.
				value={value}
				onChange={(newValue) => onChange(newValue || "")}
				language="json"
				theme={resolvedTheme === "light" ? "custom-light" : "custom-dark"}
				height="100%"
				options={{
					autoIndent: "full",
					automaticLayout: true,
					fixedOverflowWidgets: true,
					folding: false,
					fontSize: 14,
					fontWeight: "400",
					formatOnPaste: true,
					formatOnType: true,
					glyphMargin: false,
					guides: { highlightActiveIndentation: false, indentation: false },
					hideCursorInOverviewRuler: true,
					lineDecorationsWidth: 0,
					lineNumbers: "off",
					lineNumbersMinChars: 0,
					minimap: { enabled: false },
					occurrencesHighlight: "off",
					overviewRulerBorder: false,
					overviewRulerLanes: 0,
					padding: { top: 12, bottom: 12 },
					renderLineHighlight: "none",
					renderValidationDecorations: "on",
					renderWhitespace: "none",
					roundedSelection: false,
					scrollbar: {
						horizontal: "auto",
						horizontalHasArrows: false,
						horizontalScrollbarSize: 10,
						vertical: "auto",
						verticalHasArrows: false,
						verticalScrollbarSize: 10,
					},
					scrollBeyondLastColumn: 0,
					scrollBeyondLastLine: false,
					selectionHighlight: false,
					stickyScroll: { enabled: false },
					wordWrap: "on",
				}}
				onMount={(editor, monaco) => {
					setEditorInstance(editor);
					setMonacoInstance(monaco);

					editor.focus();

					editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () =>
						handleSubmit.current(),
					);

					// Auto-resize based on content
					const updateHeight = () => {
						const contentHeight = editor.getContentHeight();
						const maxHeight = 192; // max-h-48 = 12rem = 192px
						const minHeight = 64; // min-h-16 = 4rem = 64px
						const newHeight = Math.min(
							Math.max(contentHeight + 24, minHeight),
							maxHeight,
						);

						setEditorHeight(newHeight);

						// Layout after height change
						setTimeout(() => editor.layout(), 0);
					};

					// Update height on content changes
					editor.onDidChangeModelContent(updateHeight);

					// Listen to validation markers to detect schema errors
					if (onValidationChange) {
						const checkValidationErrors = () => {
							const model = editor.getModel();

							if (model) {
								// Treat an empty editor as a valid "empty state" (avoid Monaco's JSON parse error).
								if (!model.getValue().trim()) {
									onValidationChange(false);

									return;
								}

								const markers = monaco.editor.getModelMarkers({
									resource: model.uri,
								});

								const hasErrors = markers.some(
									(marker: monaco.editor.IMarker) =>
										marker.severity === monaco.MarkerSeverity.Error,
								);

								onValidationChange(hasErrors);
							}
						};

						// Check on model changes
						editor.onDidChangeModelContent(checkValidationErrors);

						// Check when markers change
						monaco.editor.onDidChangeMarkers((uris: readonly monaco.Uri[]) => {
							const model = editor.getModel();

							if (model && uris.includes(model.uri)) {
								checkValidationErrors();
							}
						});

						// Initial check
						setTimeout(checkValidationErrors, 100);
					}

					// Initial height update
					setTimeout(updateHeight, 0);

					// Ensure background transparency and remove shadows
					setTimeout(() => {
						const editorElement = editor.getDomNode();

						if (editorElement) {
							// Set transparent backgrounds on all relevant elements
							const elementsToMakeTransparent = [
								".monaco-editor",
								".monaco-editor .monaco-editor-background",
								".monaco-editor .view-lines",
								".monaco-editor .margin",
								".monaco-editor .monaco-scrollable-element",
								".monaco-editor .overflow-guard",
								".view-overlays",
								".decorationsOverviewRuler",
							];

							elementsToMakeTransparent.forEach((selector) => {
								const element = editorElement.querySelector(selector);

								if (element) {
									(element as HTMLElement).style.backgroundColor =
										"transparent";
									(element as HTMLElement).style.boxShadow = "none";
								}
							});

							// Remove scroll shadows specifically - target the exact classes
							const shadowTop = editorElement.querySelector(
								".monaco-scrollable-element > .shadow.top",
							);

							if (shadowTop) {
								(shadowTop as HTMLElement).style.display = "none";
							}

							const scrollDecorations = editorElement.querySelectorAll(
								".monaco-editor .scroll-decoration, .scroll-decoration",
							);

							scrollDecorations.forEach((decoration) => {
								(decoration as HTMLElement).style.display = "none";
							});

							const scrollableElement = editorElement.querySelector(
								".monaco-scrollable-element",
							);

							if (scrollableElement) {
								(scrollableElement as HTMLElement).style.setProperty(
									"--scroll-shadow",
									"none",
								);
								(scrollableElement as HTMLElement).style.setProperty(
									"box-shadow",
									"none",
									"important",
								);
							}

							// Also set transparent and remove shadow on the editor element itself
							(editorElement as HTMLElement).style.backgroundColor =
								"transparent";
							(editorElement as HTMLElement).style.boxShadow = "none";
						}
					}, 0);
				}}
				beforeMount={(monaco) => {
					setMonacoInstance(monaco);

					// Use the same direct theme imports as code-block
					const oneLight = (
						"default" in oneLightModule
							? oneLightModule.default
							: oneLightModule
					) as ThemeRegistration;

					const oneDarkPro = (
						"default" in oneDarkProModule
							? oneDarkProModule.default
							: oneDarkProModule
					) as ThemeRegistration;

					const lightMonacoTheme = convertShikiToMonaco(oneLight, "one-light");

					monaco.editor.defineTheme(
						"custom-light",
						lightMonacoTheme as monaco.editor.IStandaloneThemeData,
					);

					const darkMonacoTheme = convertShikiToMonaco(
						oneDarkPro,
						"one-dark-pro",
					);

					monaco.editor.defineTheme(
						"custom-dark",
						darkMonacoTheme as monaco.editor.IStandaloneThemeData,
					);
				}}
			/>
		</div>
	);
}
