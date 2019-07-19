/**
 * @license Copyright (c) 2003-2018, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md.
 */

/**
 * @module code-block/codeblockcommand
 */

import Plugin from '@ckeditor/ckeditor5-core/src/plugin';

import CodeBlockCommand from './codeblockcommand';
import Widget from '@ckeditor/ckeditor5-widget/src/widget';
import { toWidget, toWidgetEditable } from '@ckeditor/ckeditor5-widget/src/utils';
/**
 * The code Block editing.
 *
 * Introduces the `'codeBlock'` command and the `'codeBlock'` model element.
 *
 * @extends module:core/plugin~Plugin
 */
export default class CodeBlockEditing extends Plugin {
	/**
	 * @inheritDoc
	 */
	init() {
		const editor = this.editor;
		const schema = editor.model.schema;

		editor.commands.add( 'codeBlock', new CodeBlockCommand( editor ) );

		schema.register( 'codeBlock', {
			allowWhere: '$block',
			isObject: true,
			allowContentOf: '$root'
		} );
		schema.register( 'codeBlockInner', {
			isLimit: true,
			allowIn: 'codeBlock',
			allowContentOf: '$block'
		} );



		// Disallow codeBlock in codeBlock.
		schema.addChildCheck( ( ctx, childDef ) => {
			if ( ctx.endsWith( 'codeBlockInner' ) && childDef.name == 'codeBlock' ) {
				return false;
			}
		} );

		// editor.conversion.elementToElement( { model: 'codeBlock', view: 'code' } );

        editor.conversion.for( 'upcast' ).elementToElement( {
            model: 'codeBlock',
            view: {
                name: 'pre',
                classes: 'code-block'
            }
        } );
        editor.conversion.for( 'dataDowncast' ).elementToElement( {
            model: 'codeBlock',
            view: {
                name: 'pre',
                classes: 'code-block'
            }
        } );
        editor.conversion.for( 'editingDowncast' ).elementToElement( {
            model: 'codeBlock',
            view: ( modelElement, viewWriter ) => {
                const pre = viewWriter.createContainerElement( 'pre', { class: 'code-block' } );

                return toWidget( pre, viewWriter, { label: 'simple box widget' } );
            }
		} );

        editor.conversion.for( 'upcast' ).elementToElement( {
            model: 'codeBlockInner',
            view: {
                name: 'code',
                classes: 'code-block-inner'
            }
        } );
        editor.conversion.for( 'dataDowncast' ).elementToElement( {
            model: 'codeBlockInner',
            view: {
                name: 'code',
                classes: 'code-block-inner'
            }
        } );
        editor.conversion.for( 'editingDowncast' ).elementToElement( {
            model: 'codeBlockInner',
            view: ( modelElement, viewWriter ) => {
                const code = viewWriter.createContainerElement( 'code', { class: 'code-block-inner' } );

                return toWidgetEditable( code, viewWriter, { label: 'simple box inner' } );
            }
        } );

		// Postfixer which cleans incorrect model states connected with code blocks.
		editor.model.document.registerPostFixer( writer => {
			const changes = editor.model.document.differ.getChanges();

			for ( const entry of changes ) {
				if ( entry.type == 'insert' ) {
					const element = entry.position.nodeAfter;

					if ( !element ) {
						// We are inside a text node.
						continue;
					}

					if ( element.is( 'codeBlock' ) && element.isEmpty ) {
						// Added an empty codeBlock - remove it.
						writer.remove( element );

						return true;
					} else if ( element.is( 'codeBlock' ) && !schema.checkChild( entry.position, element ) ) {
						// Added a blockQuote in incorrect place - most likely inside another blockQuote. Unwrap it
						// so the content inside is not lost.
						writer.unwrap( element );

						return true;
					} else if ( element.is( 'codeBlock' ) ) {
						// Just added an element. Check its children to see if there are no nested blockQuotes somewhere inside.
						const range = writer.createRangeIn( element );

						for ( const child of range.getItems() ) {
							if ( child.is( 'codeBlock' ) && !schema.checkChild( writer.createPositionBefore( child ), child ) ) {
								writer.unwrap( child );

								return true;
							}
						}
					}
				} else if ( entry.type == 'remove' ) {
					const parent = entry.position.parent;

					if ( parent.is( 'codeBlock' ) && parent.isEmpty ) {
						// Something got removed and now blockQuote is empty. Remove the blockQuote as well.
						writer.remove( parent );

						return true;
					}
				}
			}

			return false;
		} );
	}

	/**
	 * @inheritDoc
	 */
	afterInit() {
		const editor = this.editor;
		const command = editor.commands.get( 'blockQuote' );

		// Overwrite default Enter key behavior.
		// If Enter key is pressed with selection collapsed in empty block inside a quote, break the quote.
		// This listener is added in afterInit in order to register it after list's feature listener.
		// We can't use a priority for this, because 'low' is already used by the enter feature, unless
		// we'd use numeric priority in this case.
		this.listenTo( this.editor.editing.view.document, 'enter', ( evt, data ) => {
			const doc = this.editor.model.document;
			const positionParent = doc.selection.getLastPosition().parent;

			if ( doc.selection.isCollapsed && positionParent.isEmpty && command.value ) {
				this.editor.execute( 'blockQuote' );
				this.editor.editing.view.scrollToTheSelection();

				data.preventDefault();
				evt.stop();
			}
		} );
	}
}
