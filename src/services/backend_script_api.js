const log = require('./log');
const noteService = require('./notes');
const sql = require('./sql');
const utils = require('./utils');
const attributeService = require('./attributes');
const dateNoteService = require('./date_notes');
const treeService = require('./tree');
const config = require('./config');
const axios = require('axios');
const dayjs = require('dayjs');
const xml2js = require('xml2js');
const cloningService = require('./cloning');
const appInfo = require('./app_info');
const searchService = require('./search/services/search');
const SearchContext = require("./search/search_context");
const becca = require("../becca/becca");
const ws = require("./ws");
const SpacedUpdate = require("./spaced_update");
const specialNotesService = require("./special_notes");
const branchService = require("./branches");
const exportService = require("./export/zip");

/**
 * <p>This is the main backend API interface for scripts. All the properties and methods are published in the "api" object
 * available in the JS backend notes. You can use e.g. <code>api.log(api.startNote.title);</code></p>
 *
 * @constructor
 */
function BackendScriptApi(currentNote, apiParams) {
    /** @property {BNote} note where script started executing */
    this.startNote = apiParams.startNote;
    /** @property {BNote} note where script is currently executing. Don't mix this up with concept of active note */
    this.currentNote = currentNote;
    /** @property {AbstractBeccaEntity} entity whose event triggered this executions */
    this.originEntity = apiParams.originEntity;

    for (const key in apiParams) {
        this[key] = apiParams[key];
    }

    /**
     * @property {axios} Axios library for HTTP requests. See {@link https://axios-http.com} for documentation
     * @deprecated use native (browser compatible) fetch() instead
     */
    this.axios = axios;
    /** @property {dayjs} day.js library for date manipulation. See {@link https://day.js.org} for documentation */
    this.dayjs = dayjs;
    /** @property {axios} xml2js library for XML parsing. See {@link https://github.com/Leonidas-from-XIV/node-xml2js} for documentation */
    this.xml2js = xml2js;

    /**
     * Instance name identifies particular Trilium instance. It can be useful for scripts
     * if some action needs to happen on only one specific instance.
     *
     * @returns {string|null}
     */
    this.getInstanceName = () => config.General ? config.General.instanceName : null;

    /**
     * @method
     * @param {string} noteId
     * @returns {BNote|null}
     */
    this.getNote = noteId => becca.getNote(noteId);

    /**
     * @method
     * @param {string} branchId
     * @returns {BBranch|null}
     */
    this.getBranch = branchId => becca.getBranch(branchId);

    /**
     * @method
     * @param {string} attributeId
     * @returns {BAttribute|null}
     */
    this.getAttribute = attributeId => becca.getAttribute(attributeId);

    /**
     * This is a powerful search method - you can search by attributes and their values, e.g.:
     * "#dateModified =* MONTH AND #log". See {@link https://github.com/zadam/trilium/wiki/Search} for full documentation for all options
     *
     * @method
     * @param {string} query
     * @param {Object} [searchParams]
     * @returns {BNote[]}
     */
    this.searchForNotes = (query, searchParams = {}) => {
        if (searchParams.includeArchivedNotes === undefined) {
            searchParams.includeArchivedNotes = true;
        }

        if (searchParams.ignoreHoistedNote === undefined) {
            searchParams.ignoreHoistedNote = true;
        }

        const noteIds = searchService.findResultsWithQuery(query, new SearchContext(searchParams))
            .map(sr => sr.noteId);

        return becca.getNotes(noteIds);
    };

    /**
     * This is a powerful search method - you can search by attributes and their values, e.g.:
     * "#dateModified =* MONTH AND #log". See {@link https://github.com/zadam/trilium/wiki/Search} for full documentation for all options
     *
     * @method
     * @param {string} query
     * @param {Object} [searchParams]
     * @returns {BNote|null}
     */
    this.searchForNote = (query, searchParams = {}) => {
        const notes = this.searchForNotes(query, searchParams);

        return notes.length > 0 ? notes[0] : null;
    };

    /**
     * Retrieves notes with given label name & value
     *
     * @method
     * @param {string} name - attribute name
     * @param {string} [value] - attribute value
     * @returns {BNote[]}
     */
    this.getNotesWithLabel = attributeService.getNotesWithLabel;

    /**
     * Retrieves first note with given label name & value
     *
     * @method
     * @param {string} name - attribute name
     * @param {string} [value] - attribute value
     * @returns {BNote|null}
     */
    this.getNoteWithLabel = attributeService.getNoteWithLabel;

    /**
     * If there's no branch between note and parent note, create one. Otherwise, do nothing. Returns the new or existing branch.
     *
     * @method
     * @param {string} noteId
     * @param {string} parentNoteId
     * @param {string} prefix - if branch will be created between note and parent note, set this prefix
     * @returns {{branch: BBranch|null}}
     */
    this.ensureNoteIsPresentInParent = cloningService.ensureNoteIsPresentInParent;

    /**
     * If there's a branch between note and parent note, remove it. Otherwise, do nothing.
     *
     * @method
     * @param {string} noteId
     * @param {string} parentNoteId
     * @returns {void}
     */
    this.ensureNoteIsAbsentFromParent = cloningService.ensureNoteIsAbsentFromParent;

    /**
     * Based on the value, either create or remove branch between note and parent note.
     *
     * @method
     * @param {boolean} present - true if we want the branch to exist, false if we want it gone
     * @param {string} noteId
     * @param {string} parentNoteId
     * @param {string} prefix - if branch will be created between note and parent note, set this prefix
     * @returns {void}
     */
    this.toggleNoteInParent = cloningService.toggleNoteInParent;

    /**
     * Create text note. See also createNewNote() for more options.
     *
     * @method
     * @param {string} parentNoteId
     * @param {string} title
     * @param {string} content
     * @returns {{note: BNote, branch: BBranch}} - object having "note" and "branch" keys representing respective objects
     */
    this.createTextNote = (parentNoteId, title, content = '') => noteService.createNewNote({
        parentNoteId,
        title,
        content,
        type: 'text'
    });

    /**
     * Create data note - data in this context means object serializable to JSON. Created note will be of type 'code' and
     * JSON MIME type. See also createNewNote() for more options.
     *
     * @method
     * @param {string} parentNoteId
     * @param {string} title
     * @param {object} content
     * @returns {{note: BNote, branch: BBranch}} object having "note" and "branch" keys representing respective objects
     */
    this.createDataNote = (parentNoteId, title, content = {}) => noteService.createNewNote({
        parentNoteId,
        title,
        content: JSON.stringify(content, null, '\t'),
        type: 'code',
        mime: 'application/json'
    });

    /**
     * @method
     *
     * @property {object} params
     * @property {string} params.parentNoteId
     * @property {string} params.title
     * @property {string|buffer} params.content
     * @property {string} params.type - text, code, file, image, search, book, relationMap, canvas
     * @property {string} [params.mime] - value is derived from default mimes for type
     * @property {boolean} [params.isProtected=false]
     * @property {boolean} [params.isExpanded=false]
     * @property {string} [params.prefix='']
     * @property {int} [params.notePosition] - default is last existing notePosition in a parent + 10
     * @returns {{note: BNote, branch: BBranch}} object contains newly created entities note and branch
     */
    this.createNewNote = noteService.createNewNote;

    /**
     * @method
     * @deprecated please use createTextNote() with similar API for simpler use cases or createNewNote() for more complex needs
     *
     * @param {string} parentNoteId - create new note under this parent
     * @param {string} title
     * @param {string} [content=""]
     * @param {object} [extraOptions={}]
     * @property {boolean} [extraOptions.json=false] - should the note be JSON
     * @property {boolean} [extraOptions.isProtected=false] - should the note be protected
     * @property {string} [extraOptions.type='text'] - note type
     * @property {string} [extraOptions.mime='text/html'] - MIME type of the note
     * @property {object[]} [extraOptions.attributes=[]] - attributes to be created for this note
     * @property {string} extraOptions.attributes.type - attribute type - label, relation etc.
     * @property {string} extraOptions.attributes.name - attribute name
     * @property {string} [extraOptions.attributes.value] - attribute value
     * @returns {{note: BNote, branch: BBranch}} object contains newly created entities note and branch
     */
    this.createNote = (parentNoteId, title, content = "", extraOptions= {}) => {
        extraOptions.parentNoteId = parentNoteId;
        extraOptions.title = title;

        const parentNote = becca.getNote(parentNoteId);

        // code note type can be inherited, otherwise text is default
        extraOptions.type = parentNote.type === 'code' ? 'code' : 'text';
        extraOptions.mime = parentNote.type === 'code' ? parentNote.mime : 'text/html';

        if (extraOptions.json) {
            extraOptions.content = JSON.stringify(content || {}, null, '\t');
            extraOptions.type = 'code';
            extraOptions.mime = 'application/json';
        }
        else {
            extraOptions.content = content;
        }

        return sql.transactional(() => {
            const {note, branch} = noteService.createNewNote(extraOptions);

            for (const attr of extraOptions.attributes || []) {
                attributeService.createAttribute({
                    noteId: note.noteId,
                    type: attr.type,
                    name: attr.name,
                    value: attr.value,
                    isInheritable: !!attr.isInheritable
                });
            }

            return {note, branch};
        });
    };

    this.logMessages = {};
    this.logSpacedUpdates = {};

    /**
     * Log given message to trilium logs and log pane in UI
     *
     * @method
     * @param message
     * @returns {void}
     */
    this.log = message => {
        log.info(message);

        const {noteId} = this.startNote;

        this.logMessages[noteId] = this.logMessages[noteId] || [];
        this.logSpacedUpdates[noteId] = this.logSpacedUpdates[noteId] || new SpacedUpdate(() => {
            const messages = this.logMessages[noteId];
            this.logMessages[noteId] = [];

            ws.sendMessageToAllClients({
                type: 'api-log-messages',
                noteId,
                messages
            });
        }, 100);

        this.logMessages[noteId].push(message);
        this.logSpacedUpdates[noteId].scheduleUpdate();
    };

    /**
     * Returns root note of the calendar.
     *
     * @method
     * @returns {BNote|null}
     */
    this.getRootCalendarNote = dateNoteService.getRootCalendarNote;

    /**
     * Returns day note for given date. If such note doesn't exist, it is created.
     *
     * @method
     * @param {string} date in YYYY-MM-DD format
     * @param {BNote} [rootNote] - specify calendar root note, normally leave empty to use the default calendar
     * @returns {BNote|null}
     */
    this.getDayNote = dateNoteService.getDayNote;

    /**
     * Returns today's day note. If such note doesn't exist, it is created.
     *
     * @method
     * @param {BNote} [rootNote] - specify calendar root note, normally leave empty to use the default calendar
     * @returns {BNote|null}
     */
    this.getTodayNote = dateNoteService.getTodayNote;

    /**
     * Returns note for the first date of the week of the given date.
     *
     * @method
     * @param {string} date in YYYY-MM-DD format
     * @param {object} [options]
     * @param {string} [options.startOfTheWeek=monday] - either "monday" (default) or "sunday"
     * @param {BNote} [rootNote] - specify calendar root note, normally leave empty to use the default calendar
     * @returns {BNote|null}
     */
    this.getWeekNote = dateNoteService.getWeekNote;

    /**
     * Returns month note for given date. If such note doesn't exist, it is created.
     *
     * @method
     * @param {string} date in YYYY-MM format
     * @param {BNote} [rootNote] - specify calendar root note, normally leave empty to use the default calendar
     * @returns {BNote|null}
     */
    this.getMonthNote = dateNoteService.getMonthNote;

    /**
     * Returns year note for given year. If such note doesn't exist, it is created.
     *
     * @method
     * @param {string} year in YYYY format
     * @param {BNote} [rootNote] - specify calendar root note, normally leave empty to use the default calendar
     * @returns {BNote|null}
     */
    this.getYearNote = dateNoteService.getYearNote;

    /**
     * Sort child notes of a given note.
     *
     * @method
     * @param {string} parentNoteId - this note's child notes will be sorted
     * @param {object} [sortConfig]
     * @property {string} [sortConfig.sortBy=title] - 'title', 'dateCreated', 'dateModified' or a label name
     *                                See {@link https://github.com/zadam/trilium/wiki/Sorting} for details.
     * @property {boolean} [sortConfig.reverse=false]
     * @property {boolean} [sortConfig.foldersFirst=false]
     * @returns {void}
     */
    this.sortNotes = (parentNoteId, sortConfig = {}) => treeService.sortNotes(
        parentNoteId,
        sortConfig.sortBy || "title",
        !!sortConfig.reverse,
        !!sortConfig.foldersFirst
    );

    /**
     * This method finds note by its noteId and prefix and either sets it to the given parentNoteId
     * or removes the branch (if parentNoteId is not given).
     *
     * This method looks similar to toggleNoteInParent() but differs because we're looking up branch by prefix.
     *
     * @method
     * @deprecated this method is pretty confusing and serves specialized purpose only
     * @param {string} noteId
     * @param {string} prefix
     * @param {string|null} parentNoteId
     * @returns {void}
     */
    this.setNoteToParent = treeService.setNoteToParent;

    /**
     * This functions wraps code which is supposed to be running in transaction. If transaction already
     * exists, then we'll use that transaction.
     *
     * @method
     * @param {function} func
     * @returns {?} result of func callback
     */
    this.transactional = sql.transactional;

    /**
     * Return randomly generated string of given length. This random string generation is NOT cryptographically secure.
     *
     * @method
     * @param {number} length of the string
     * @returns {string} random string
     */
    this.randomString = utils.randomString;

    /**
     * @method
     * @param {string} string to escape
     * @returns {string} escaped string
     */
    this.escapeHtml = utils.escapeHtml;

    /**
     * @method
     * @param {string} string to unescape
     * @returns {string} unescaped string
     */
    this.unescapeHtml = utils.unescapeHtml;

    /**
     * @property {module:sql} sql
     */
    this.sql = sql;

    /**
     * @method
     * @returns {{syncVersion, appVersion, buildRevision, dbVersion, dataDirectory, buildDate}|*} - object representing basic info about running Trilium version
     */
    this.getAppInfo = () => appInfo

    /**
     * Creates a new launcher to the launchbar. If the launcher (id) already exists, it will be updated.
     *
     * @method
     * @param {object} opts
     * @property {string} opts.id - id of the launcher, only alphanumeric at least 6 characters long
     * @property {string} opts.type - one of
     *                          * "note" - activating the launcher will navigate to the target note (specified in targetNoteId param)
     *                          * "script" -  activating the launcher will execute the script (specified in scriptNoteId param)
     *                          * "customWidget" - the launcher will be rendered with a custom widget (specified in widgetNoteId param)
     * @property {string} opts.title
     * @property {boolean} [opts.isVisible=false] - if true, will be created in the "Visible launchers", otherwise in "Available launchers"
     * @property {string} [opts.icon] - name of the boxicon to be used (e.g. "bx-time")
     * @property {string} [opts.keyboardShortcut] - will activate the target note/script upon pressing, e.g. "ctrl+e"
     * @property {string} [opts.targetNoteId] - for type "note"
     * @property {string} [opts.scriptNoteId] - for type "script"
     * @property {string} [opts.widgetNoteId] - for type "customWidget"
     * @returns {{note: BNote}}
     */
    this.createOrUpdateLauncher = opts => {
        if (!opts.id) { throw new Error("ID is a mandatory parameter for api.createOrUpdateLauncher(opts)"); }
        if (!opts.id.match(/[a-z0-9]{6,1000}/i)) { throw new Error(`ID must be an alphanumeric string at least 6 characters long.`); }
        if (!opts.type) { throw new Error("Launcher Type is a mandatory parameter for api.createOrUpdateLauncher(opts)"); }
        if (!["note", "script", "customWidget"].includes(opts.type)) { throw new Error(`Given launcher type '${opts.type}'`); }
        if (!opts.title?.trim()) { throw new Error("Title is a mandatory parameter for api.createOrUpdateLauncher(opts)"); }
        if (opts.type === 'note' && !opts.targetNoteId) { throw new Error("targetNoteId is mandatory for launchers of type 'note'"); }
        if (opts.type === 'script' && !opts.scriptNoteId) { throw new Error("scriptNoteId is mandatory for launchers of type 'script'"); }
        if (opts.type === 'customWidget' && !opts.widgetNoteId) { throw new Error("widgetNoteId is mandatory for launchers of type 'customWidget'"); }

        const parentNoteId = opts.isVisible ? '_lbVisibleLaunchers' : '_lbAvailableLaunchers';
        const noteId = 'al_' + opts.id;

        const launcherNote =
            becca.getNote(noteId) ||
            specialNotesService.createLauncher({
                noteId: noteId,
                parentNoteId: parentNoteId,
                launcherType: opts.type,
            }).note;

        if (launcherNote.title !== opts.title) {
            launcherNote.title = opts.title;
            launcherNote.save();
        }

        if (launcherNote.getParentBranches().length === 1) {
            const branch = launcherNote.getParentBranches()[0];

            if (branch.parentNoteId !== parentNoteId) {
                branchService.moveBranchToNote(branch, parentNoteId);
            }
        }

        if (opts.type === 'note') {
            launcherNote.setRelation('target', opts.targetNoteId);
        } else if (opts.type === 'script') {
            launcherNote.setRelation('script', opts.scriptNoteId);
        } else if (opts.type === 'customWidget') {
            launcherNote.setRelation('widget', opts.widgetNoteId);
        } else {
            throw new Error(`Unrecognized launcher type '${opts.type}'`);
        }

        if (opts.keyboardShortcut) {
            launcherNote.setLabel('keyboardShortcut', opts.keyboardShortcut);
        } else {
            launcherNote.removeLabel('keyboardShortcut');
        }

        if (opts.icon) {
            launcherNote.setLabel('iconClass', `bx ${opts.icon}`);
        } else {
            launcherNote.removeLabel('iconClass');
        }

        return {note: launcherNote};
    };

    /**
     * @method
     * @param {string} noteId
     * @param {string} format - either 'html' or 'markdown'
     * @param {string} zipFilePath
     * @returns {Promise<void>}
     */
    this.exportSubtreeToZipFile = async (noteId, format, zipFilePath) => await exportService.exportToZipFile(noteId, format, zipFilePath);

    /**
     * This object contains "at your risk" and "no BC guarantees" objects for advanced use cases.
     *
     * @property {Becca} becca - provides access to the backend in-memory object graph, see {@link https://github.com/zadam/trilium/blob/master/src/becca/becca.js}
     */
    this.__private = {
        becca
    }
}

module.exports = BackendScriptApi;
