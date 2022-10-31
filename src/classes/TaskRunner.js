/**
 * Requires
 */
const { Exception } = require( '@squirrel-forge/node-util' );
const { isPojo } = require( '@squirrel-forge/node-objection' );

/**
 * TaskRunner exception
 * @class
 */
class TaskRunnerException extends Exception {}

/**
 * @typedef {Array<TaskData|TaskList|TaskMap>} TaskList
 */

/**
 * @typedef {Object<string,TaskData|TaskList|TaskMap>} TaskMap
 */

/**
 * @typedef {Object} TaskData
 * @property {string} type - Task type name
 * @property {Object} options - Task options
 * @property {Array} args - Task arguments
 */

/**
 * @typedef {Function} TaskRunnerNotify
 * @param {Error|Exception} msg - Error or exception instance
 * @return {void}
 */

/**
 * @typedef {Function} TaskParser
 * @param {TaskData} data - Task data object
 * @return {void}
 */

/**
 * TaskRunner class
 * @class
 */
class TaskRunner {

    /**
     * Constructor
     * @constructor
     * @param {boolean} strict - Strict mode, default: true
     * @param {TaskRunnerNotify} notify - Notification callback for non strict mode
     * @param {TaskParser} taskParser - Parses task data before processing
     */
    constructor( strict = true, notify = null, taskParser = null ) {

        /**
         * Strict mode
         * @protected
         * @property
         * @type {boolean}
         */
        this._strict = strict;

        /**
         * Notify in non strict callback
         * @protected
         * @property
         * @type {Function}
         */
        this._notify = notify;

        /**
         * Parse/modify task data before construction
         * @protected
         * @property
         * @type {Function}
         */
        this._parser = taskParser;

        /**
         * Available task types
         * @protected
         * @property
         * @type {Object}
         */
        this._types = {};
    }

    /**
     * Throw or notify on error
     * @public
     * @param {Error|Exception} err - Exception instance
     * @throws {Error|Exception|TaskRunnerException|TaskException}
     * @return {void}
     */
    error( err ) {
        if ( this._strict ) throw err;
        if ( this._notify ) this._notify( err );
    }

    /**
     * Register task constructor
     * @public
     * @param {string} name Task type
     * @param {Function|Task} TaskConstructor - Task constructor
     * @param {boolean} replace - Replace existing task constructor
     * @return {void}
     */
    register( name, TaskConstructor, replace = false ) {
        if ( typeof TaskConstructor !== 'function' ) {
            this.error( new TaskRunnerException( 'Task constructor must be a constructor: ' + name ) );
            return;
        }
        if ( !replace && this._types[ name ] ) {
            this.error( new TaskRunnerException( 'Task constructor already defined: ' + name ) );
        } else {
            this._types[ name ] = TaskConstructor;
        }
    }

    /**
     * Get constructor
     * @public
     * @param {string} name - Task type
     * @return {null|Function|Task} - Task constructor if available
     */
    getTaskConstructor( name ) {
        if ( this._types[ name ] ) {
            return this._types[ name ];
        }
        return null;
    }

    /**
     * Run tasks in parallel
     * @public
     * @param {TaskList} taskList - Task list
     * @return {Promise<Array<null|TaskStatsObject>>} - Array of nulls and stats objects
     */
    async parallel( taskMap ) {
        if ( !isPojo( taskMap ) || typeof taskMap.type === 'string' ) {
            this.error( new TaskRunnerException( 'Invalid parallel type: ' + typeof taskMap ) );
            return {};
        }

        // Run in parallel and collect promises
        const tasks = [];
        const stats = {};
        const entries = Object.entries( taskMap );
        for ( let i = 0; i < entries.length; i++ ) {
            const [ name, value ] = entries[ i ];
            stats[ name ] = this.run( value );
            tasks.push( stats[ name ] );
        }
        await Promise.all( tasks );
        return stats;
    }

    /**
     * Run tasks in sequence
     * @public
     * @param {TaskMap} taskMap - Task map
     * @return {Promise<Object<string,TaskStatsObject>>} - Object of nulls and stats objects
     */
    async sequence( taskMap ) {
        if ( !( taskMap instanceof Array ) ) {
            this.error( new TaskRunnerException( 'Invalid sequence type: ' + typeof taskMap ) );
            return [];
        }

        // Process each map/task in order
        const stats = [];
        for ( let i = 0; i < taskMap.length; i++ ) {
            stats[ i ] = await this.run( taskMap[ i ] );
        }
        return stats;
    }

    /**
     * Construct and run task
     * @public
     * @param {TaskData} taskData - Task data object
     * @return {Promise<null|TaskStatsObject>} - Null or stats object
     */
    async task( taskData ) {

        // Require object and possible valid type
        if ( !taskData || typeof taskData !== 'object' || typeof taskData.type !== 'string' || !taskData.type.length ) {
            this.error( new TaskRunnerException( 'Invalid task type: ' + taskData.type ) );
            return null;
        }

        // Allow external parser to modify the taskData object
        if ( this._parser ) {
            this._parser( taskData );
        }

        // Always make sure options are defined
        if ( !isPojo( taskData.options ) ) {
            taskData.options = {};
        }

        // Use custom id if set, useful when when running the same task type multiple times
        if ( taskData.id ) {
            taskData.options.id = taskData.id;
        }

        // Arguments must always be an array
        if ( !( taskData.args instanceof Array ) ) {
            taskData.args = taskData.args ? [ taskData.args ] : [];
        }

        // Get the task constructor
        const TaskConstructor = this.getTaskConstructor( taskData.type );
        if ( !TaskConstructor ) {
            this.error( new TaskRunnerException( 'Unknown task type: ' + taskData.type ) );
            return null;
        }

        // Attempt to create task
        let stats = null, task;
        try {
            task = new TaskConstructor( this, taskData.options );
        } catch ( e ) {
            this.error( new TaskRunnerException( 'Failed to construct task: ' + taskData.type, e ) );
            return null;
        }

        // Attempt to run task
        try {
            stats = await task.run( ...taskData.args );
        } catch ( e ) {
            this.error( new TaskRunnerException( 'Failed to run task: ' + taskData.type, e ) );
            return null;
        }
        return stats;
    }

    /**
     * Run task map
     * @public
     * @param {TaskList|TaskMap|TaskData} taskInput - Task input
     * @return {Promise<null|Array<null|TaskStatsObject>|Object<string,null|TaskStatsObject>>} - Null on error, stats object or Array/Object map of nulls and stats objects
     */
    async run( taskInput ) {
        let stats = null;

        // Arrays are run in sequence, array order matters
        if ( taskMap instanceof Array ) {
            stats = await this.sequence( taskMap );
        } else if ( isPojo( taskMap ) ) {

            // Assume it's a task if it has a type property
            if ( taskInput.type ) {
                stats = await this.task( taskInput );
            } else {

                // All other objects are assumed to be parallel maps
                stats = await this.parallel( taskMap );
            }
        } else {

            // If we have invalid data we might break
            this.error( new TaskRunnerException( 'Invalid taskInput type: ' + typeof taskInput ) );
            return null;
        }

        // Return stats object
        return stats;
    }
}

// Export Exception as static property constructor
TaskRunner.TaskRunnerException = TaskRunnerException;
module.exports = TaskRunner;
