/**
 * Requires
 */
const { Exception, Timer, strand } = require( '@squirrel-forge/node-util' );
const { isPojo, cloneObject, mergeObject } = require( '@squirrel-forge/node-objection' );

/**
 * Task exception
 * @class
 */
class TaskException extends Exception {}

/**
 * @typedef {Object} TaskStatsObject
 * @property {string} id - Task id
 * @property {Array<number,number>} time - Process hrtime
 */

/**
 * Task class
 * @abstract
 * @class
 */
class Task {

    /**
     * Constructor
     * @constructor
     * @param {TaskRunner} runner - Runner instance
     * @param {null|TaskData.options} options - Task options object
     * @param {Object} defaults - Task default options
     */
    constructor( runner, options = null, defaults = {} ) {

        // Require task id
        if ( !defaults.id ) {
            defaults.id = strand();
        }

        /**
         * Timer
         * @public
         * @type {Timer}
         */
        this.timer = new Timer();

        /**
         * Runner instance
         * @public
         * @property
         * @type {TaskRunner}
         */
        this.runner = runner;

        /**
         * Options defults
         * @protected
         * @property
         * @type {Object}
         */
        this._defaults = defaults;

        /**
         * Options
         * @protected
         * @property
         * @type {Object}
         */
        this._ = cloneObject( this._defaults, true );

        // Apply custom options
        if ( options && isPojo( options ) ) {
            mergeObject( this._, options, true, true, true, true );
        }
    }

    /**
     * Generate stats object
     * @param {Object|TaskStatsObject} data - Stats data
     * @return {TaskStatsObject} - Stats data
     */
    stats( data = {} ) {

        // Force id and set processing time
        data.id = this._.id;
        data.time = this.timer.end( 'construct' );
        return data;
    }

    /**
     * Run task
     * @public
     * @abstract
     * @throws TaskException
     * @return {Promise<null|TaskStatsObject>} - Null on fail, stats object on success
     */
    async run() {
        throw new TaskException( 'Task must implement a run method' );
    }
}

// Export Exception as static property constructor
Task.TaskException = TaskException;
module.exports = Task;
