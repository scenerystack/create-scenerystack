#!/usr/bin/env node

/**
 * Hooks for `npx scenerystack <command>`.
 *
 * NOTE: if testing locally, do something like `npx --prefix ../git/scenerystack scenerystack checkout`
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

const prompts = require( '@inquirer/prompts' );
const rimraf = require( 'rimraf' );
const fs = require( 'fs' );
const assert = require( 'assert' );
const child_process = require( 'child_process' );
const os = require( 'os' )

// prompts.input, prompts.select
// https://github.com/SBoudrias/Inquirer.js/tree/main/packages/input
// https://github.com/SBoudrias/Inquirer.js/tree/main/packages/select

/*
 * NOTE: A good chunk of the below is ported "transpiled" execute, but without the dependencies.
 */

function _extends() {
  // eslint-disable-next-line no-func-assign
  _extends = Object.assign || function( target ) {
    for ( let i = 1; i < arguments.length; i++ ) {
      // eslint-disable-next-line prefer-rest-params
      const source = arguments[ i ];
      for ( const key in source ) {
        // eslint-disable-next-line prefer-object-has-own
        if ( Object.prototype.hasOwnProperty.call( source, key ) ) {
          target[ key ] = source[ key ];
        }
      }
    }
    return target;
  };
  // eslint-disable-next-line prefer-rest-params
  return _extends.apply( this, arguments );
}

/**
 * NOTE: Transpiled/adapted version of execute() to run without dependencies.
 *
 * Executes a command, with specific arguments and in a specific directory (cwd).
 *
 * Resolves with the stdout: {string}
 * Rejects with { code: {number}, stdout: {string} } -- Happens if the exit code is non-zero.
 *
 * @param cmd - The process to execute. Should be on the current path.
 * @param args - Array of arguments. No need to extra-quote things.
 * @param cwd - The working directory where the process should be run from
 * @param providedOptions
 * @rejects {ExecuteError}
 */
function execute( cmd, args, cwd, providedOptions = {} ) {
  const startTime = Date.now();

  const errorsOption = providedOptions.errors ?? 'reject';
  const childProcessEnvOption = providedOptions.childProcessOptions?.env ?? _extends( {}, process.env );
  const childProcessShellOption = providedOptions.childProcessOptions?.shell ?? ( cmd !== 'node' && cmd !== 'git' && process.platform.startsWith( 'win' ) );
  const logOutput = providedOptions.logOutput ?? false;

  assert( errorsOption === 'reject' || errorsOption === 'resolve', 'Errors must reject or resolve' );
  return new Promise( ( resolve, reject ) => {
    let rejectedByError = false;
    let stdout = ''; // to be appended to
    let stderr = '';
    const childProcess = child_process.spawn( cmd, args, {
      cwd: cwd,
      env: childProcessEnvOption,
      shell: childProcessShellOption
    } );
    childProcess.on( 'error', error => {
      rejectedByError = true;
      if ( errorsOption === 'resolve' ) {
        resolve( {
          code: 1,
          stdout: stdout,
          stderr: stderr,
          cwd: cwd,
          error: error,
          time: Date.now() - startTime
        } );
      }
      else {
        reject( new ExecuteError( cmd, args, cwd, stdout, stderr, -1, Date.now() - startTime ) );
      }
    } );
    childProcess.stderr && childProcess.stderr.on( 'data', data => {
      stderr += data;
      if ( logOutput ) {
        process.stdout.write( '' + data );
      }
    } );
    childProcess.stdout && childProcess.stdout.on( 'data', data => {
      stdout += data;
      if ( logOutput ) {
        process.stdout.write( '' + data );
      }
    } );
    childProcess.on( 'close', code => {
      if ( !rejectedByError ) {
        if ( errorsOption === 'resolve' ) {
          resolve( {
            code: code,
            stdout: stdout,
            stderr: stderr,
            cwd: cwd,
            time: Date.now() - startTime
          } );
        }
        else {
          if ( code !== 0 ) {
            reject( new ExecuteError( cmd, args, cwd, stdout, stderr, code, Date.now() - startTime ) );
          }
          else {
            resolve( stdout );
          }
        }
      }
    } );
  } );
}
const ExecuteError = class ExecuteError extends Error {
  constructor( cmd, args, cwd, stdout, stderr, code, time// ms
  ) {
    super( `${cmd} ${args.join( ' ' )} in ${cwd} failed with exit code ${code}${stdout ? `\nstdout:\n${stdout}` : ''}${stderr ? `\nstderr:\n${stderr}` : ''}` );
    this.cmd = cmd;
    this.args = args;
    this.cwd = cwd;
    this.stdout = stdout;
    this.stderr = stderr;
    this.code = code;
    this.time = time;
  }
};

( async () => {

  const projectName = await prompts.input( {
    message: 'Project name:',
    default: 'scenerystack-project'
  } );

  const type = await prompts.select( {
    message: 'Project type:',
    choices: [
      { name: 'Application', value: 'scenery', description: 'Create an application using Scenery for rendering and input' },
      { name: 'Simulation', value: 'sim', description: 'Create a PhET-like simulation' }
    ]
  } );

  const title = type === 'sim' ? await prompts.input( {
    message: 'Project title:',
    default: 'Sim Title'
  } ) : null;

  const bundler = await prompts.select( {
    message: 'Bundler with:',
    choices: [
      { name: 'Vite', value: 'vite', description: 'Use Vite for bundling' },
      { name: 'Parcel', value: 'parcel', description: 'Use Parcel for bundling' }
    ]
  } );

  const eslint = await prompts.confirm( {
    message: 'Use ESLint?',
    default: false
  } );

  const prettier = await prompts.confirm( {
    message: 'Use Prettier?',
    default: false
  } );

  const templateName = `${type}-template-${bundler}`;
  const absoluteDir = `${process.cwd()}/${projectName}`;

  console.log( `Scaffolding project in ${absoluteDir}` );

  // fs.mkdirSync( absoluteDir, { recursive: true } );

  await execute( 'git', [ 'clone', '--depth=1', `https://github.com/scenerystack/${templateName}.git`, projectName ], process.cwd() );

  await rimraf.rimraf( `${absoluteDir}/.git` );
  await rimraf.rimraf( `${absoluteDir}/README.md` );
  await rimraf.rimraf( `${absoluteDir}/LICENSE` );

  const linesRemoved = ( contents, str ) => {
    return contents.split( os.EOL ).filter( line => !line.includes( str ) ).join( os.EOL );
  };

  if ( type === 'scenery' ) {
    fs.writeFileSync( `${absoluteDir}/index.html`, fs.readFileSync( `${absoluteDir}/index.html`, 'utf-8' ).replaceAll( 'Application Title', projectName ) );
    fs.writeFileSync( `${absoluteDir}/package.json`, fs.readFileSync( `${absoluteDir}/package.json`, 'utf-8' ).replaceAll( 'application-name', projectName ) );
  }
  if ( type === 'sim' ) {
    fs.writeFileSync( `${absoluteDir}/package.json`, fs.readFileSync( `${absoluteDir}/package.json`, 'utf-8' ).replaceAll( 'simulation-name', projectName ) );
    fs.writeFileSync( `${absoluteDir}/src/init.ts`, fs.readFileSync( `${absoluteDir}/src/init.ts`, 'utf-8' ).replaceAll( 'simulation-name', projectName ) );
    fs.writeFileSync( `${absoluteDir}/src/main.ts`, fs.readFileSync( `${absoluteDir}/src/main.ts`, 'utf-8' ).replaceAll( 'Simulation Title', title ) );
    fs.writeFileSync( `${absoluteDir}/index.html`, fs.readFileSync( `${absoluteDir}/index.html`, 'utf-8' ).replaceAll( 'Sim Title', title ) );
  }
  if ( !eslint ) {
    await rimraf.rimraf( `${absoluteDir}/eslint.config.js` );
    fs.writeFileSync( `${absoluteDir}/package.json`, linesRemoved( fs.readFileSync( `${absoluteDir}/package.json`, 'utf-8' ), 'eslint' ) );
  }
  if ( !prettier ) {
    await rimraf.rimraf( `${absoluteDir}/.prettierignore` );
    await rimraf.rimraf( `${absoluteDir}/.prettierrc` );
    fs.writeFileSync( `${absoluteDir}/package.json`, linesRemoved( fs.readFileSync( `${absoluteDir}/package.json`, 'utf-8' ), 'prettier' ) );
  }

  // const args = process.argv.slice( 2 );
  // const command = args[ 0 ];
  //
  // console.log( `[create-scenerystack]: ${command} ${args.slice( 1 ).join( ' ' )}` );


  console.log( '' );
  console.log( 'Complete!' );
  console.log( '' );
  console.log( 'To get started, run:' );
  console.log( '' );
  console.log( `  cd ${projectName}` );
  console.log( `  npm install` );
  console.log( `  npm start` );
  console.log( '' );

} )();