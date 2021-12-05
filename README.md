# @squirrel-forge/node-taskrunner

Task runner and task class for sequential and parallel processing.

## Installation

```
npm i @squirrel-forge/node-taskrunner

```

## Usage

```
const { Task, TaskRunner } = require( '@squirrel-forge/node-taskrunner' );
```

### Classes

 - Task( runner, options, defaults )
   - runner : TaskRunner
   - timer : Timer
   - stats( obj )
   - run()
 - TaskRunner( strict, notify, parser )
   - error( exception )
   - register( name, constructor, replace )
   - getTaskConstructor( name )
   - parallel( array )
   - sequence( obj )
   - task( data )
   - run( map )

## Docs

Check the sourcecode on [github](https://github.com/squirrel-forge/node-taskrunner) for extensive comments.
