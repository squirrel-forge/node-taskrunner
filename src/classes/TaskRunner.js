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
 * @typedef {Object|Array} TaskMap
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
     * @param {Function} notify - Notification callback for non strict mode
     * @param {Function} taskParser - Parses task data before processing
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
     * @param {TaskRunnerException} err - Exception instance
     * @throws {TaskRunnerException|TaskException}
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
     * @param {Function} TaskConstructor - Task constructor
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
     * @return {null|Function} - Task constructor if available
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
     * @param {Array<Task|TaskMap>} taskMap - Task map
     * @return {Promise<Object[]>} - Array of nulls and stats objects
     */
    parallel( taskMap ) {
        const tasks = [];

        // Run in parallel and collect promises
        for ( let i = 0; i < taskMap.length; i++ ) {
            tasks.push( this.run( taskMap[ i ] ) );
        }
        return Promise.all( tasks );
    }

    /**
     * Run tasks in sequence
     * @public
     * @param {Object} taskMap - Task map
     * @return {Promise<Object>} - Object of nulls and stats objects
     */
    async sequence( taskMap ) {
        const stats = {};
        const entries = Object.entries( taskMap );

        // Process each map/task in order
        for ( let i = 0; i < entries.length; i++ ) {
            const [ name, value ] = entries[ i ];
            stats[ name ] = await this.run( value );
        }
        return stats;
    }

    /**
     * Construct and run task
     * @public
     * @param {Object} taskData - Task data object
     * @return {Promise<null|Object>} - Null or stats object
     */
    async task( taskData ) {

        // Require possible valid type
        if ( typeof taskData.type !== 'string' || !taskData.type.length ) {
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
     * @param {TaskMap} taskMap - Task map
     * @return {Promise<any[]|null|Object>} - Null, stats object or Array/Object map of nulls and stats objects
     */
    async run( taskMap ) {
        let stats;

        // Arrays are run in parallel, order does not matter
        if ( taskMap instanceof Array ) {
            stats = await this.parallel( taskMap );
        } else if ( isPojo( taskMap ) ) {

            // Assume it's a task if it has a type property
            if ( taskMap.type ) {
                stats = await this.task( taskMap );
            } else {

                // All other objects are assumed sequence maps and are processed in order
                stats = await this.sequence( taskMap );
            }
        } else {

            // If we have invalid data we might break
            this.error( new TaskRunnerException( 'Invalid taskMap type: ' + typeof taskMap ) );
            return null;
        }

        // Return stats object
        return stats;
    }
}

// Export Exception as static property constructor
TaskRunner.TaskRunnerException = TaskRunnerException;
module.exports = TaskRunner;
