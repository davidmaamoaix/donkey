const EXE_FREQ = 50;
global.currVM = null;

export const [NULL, LIST, STR, BOOL, INT, REAL] = [
    'null', 'List', 'string', 'boolean', 'integer', 'real'
].map(e => (val = null) => new DonkeyObject(e, val));

// used for testing/debugging only
function sanityError(msg) {
    return [
        `Internal Error: ${msg}`,
        'Report to David cuz hes dumb enough to mess up a simple runtime'
    ];
}

/*
    Denotes what's conventionally a heap allocated object but
    that's basically every value in this runtime implementation
    cuz weeeeeeeeeeeeeeeeeeeeeeeee.
*/
export class DonkeyObject {

    constructor(type, value) {
        this.type = type;
        this.value = value;
    }

    /*
        Primitives (real, boolean, int, string) are passed by value
        while other ones are passed by reference. This is simulated
        by just duplicating an instance of a primitive. Primitive
        types have lower case type names (as lazy as that is).

        Note that when defining a primitive type, make sure its
        value is passed-by-value in javascript.
    */
    copy() {
        const char = this.type.charAt(0);
        if (char === char.toUpperCase()) {
            return this;
        }
        return new DonkeyObject(this.type, this.value);
    }

    assertType(s, msg) {
        if (s === 'number') {
            if (this.type !== 'integer' && this.type !== 'real') {
                throw new VMError(`Type Error`, msg);
            }

            return;
        }

        if (s !== this.type) throw new VMError(`Type Error`, msg);
    }

    bool() {
        this.assertType(
            'boolean',
            `Type '${this.type}' cannot be interpreted as a boolean`
        );
        return this.value;
    }

    map(func) {
        return new DonkeyObject(this.type, func(this.value));
    }
}

class AbstractFunction {

    constructor(params) {
        this.params = params;
    }

    invoke(vm, exps) {
        throw 'not implemented';
    }
}

class CodeFunction extends AbstractFunction {

    constructor(params, code) {
        super(params);
        this.code = code;
    }

    invoke(vm, exps) {
        const frame = new FunctionFrame(this.code);

        // sanity check
        if (exps.length !== this.params.length) {
            throw sanityError('Bad parameter length during invocation');
        }

        for (var i = 0; i < exps.length; i++) {
            frame.locals[this.params[i]] = exps[i];
        }

        vm.funcFrames.push(frame);
    }
}

export class NativeFunction extends AbstractFunction {

    constructor(params, wrapped) {
        super(params);
        this.wrapped = wrapped;
    }

    invoke(vm, exps) {
        this.wrapped(vm, exps);
    }
}

class FunctionFrame {

    constructor(code) {
        this.pc = 0;
        this.locals = {};
        this.code = code; // cuz im lazy yaaaaaaaaay

        /*
            Stores the pc that was just executed, as certain
            operations change the value of pc, and if an error
            was thrown after that, the VM needs a pointer to the
            responsible instruction.
        */
        this.prevPc = 0;
    }

    execute(runtime) {
        this.prevPc = this.pc;
        const op = this.code[this.pc];
        this.pc++;
        op.execute(runtime, this);
    }
}

export class DonkeyRuntime {

    constructor(funcs, debugMode, handles) {
        this.funcFrames = [];
        this.stack = [];
        this.mainEnv = {};
        this.debugMode = debugMode;
        this.handles = handles;
        this.paused = false; // halts at breakpoint

        this.funcs = {};
        for (var i of funcs) {
            this.funcs[i.name] = new CodeFunction(i.params, i.code);
        }
    }

    pause(line) {
        if (!this.debugMode) {
            console.log(`Error: line ${line} breakpoint in non-debug mode`);
            return;
        }

        this.handles.handlePause(line);
        this.paused = true;
    }

    resume() {
        if (!this.paused) {
            console.log('Error: resuming an non-paused execution');
            return;
        }

        this.handles.handleResume();
        this.paused = false;
    }

    runMain(main='$main') {
        const frame = new FunctionFrame(this.funcs[main].code);
        this.mainEnv = frame.locals;

        this.funcFrames.push(frame);
        this.updateInterval = setInterval(() => {

            for (var i = 0; i < EXE_FREQ && this.funcFrames.length > 0; i++) {

                // breakpoint
                if (this.paused) return;

                try {
                    this.currFrame().execute(this);
                } catch (error) {
                    if (error instanceof VMError) {
                        this.handles.error(error.formatMsg(this));
                        return;
                    } else {
                        this.handles.error([
                            'Unexpected Internal Error',
                            'Check log and report to author'
                        ]);
                        throw error;
                    }
                }
            }

            if (this.funcFrames.length === 0) {
                this.handles.exit();
            }
        }, 1);
    }

    currFrame() {
        return this.funcFrames[this.funcFrames.length - 1];
    }

    push(val) {
        this.stack.push(val.copy());
    }

    pop() {
        if (this.stack.length === 0) {
            throw sanityError('Runtime Empty Stack');
        }

        return this.stack.pop().copy();
    }

    // Do some clean up before exiting.
    cleanUp() {
        clearInterval(this.updateInterval);
    }

    /*
        Used in debug mode. Gets all locally and globally defined
        variables.
    */
    getVariablesData() {
        const local = this.currFrame();
        const glob = this.funcFrames[0];
        if (local === glob) { // curr frame is $main
            return { 'global': glob.locals };
        }

        return { 'global': glob.locals, 'local': local.locals };
    }
}

export class VMError {

    constructor(type, msg) {
        this.type = type;
        this.msg = msg;
    }

    formatMsg(vm) {
        const currFrame = vm.currFrame();
        const prev = currFrame.prevPc;
        return [
            `${this.type}: Line ${currFrame.code[prev].line.line}`,
            this.msg
        ];
    }
}
