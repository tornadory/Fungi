import App			from "../App.js";
import Quat			from "../../maths/Quat.js";
import Vec3			from "../../maths/Vec3.js";
import { System }	from "../Ecs.js";

//###########################################################################
const LOOK_RATE 		= 0.002;
const ORBIT_RATE		= 0.003;
const PAN_RATE			= 0.008;
const KB_FORWARD_RATE	= -0.1;
const KB_ROTATE_RATE	= 0.04;

const FRAME_LIMIT		= 1;


//###########################################################################
class InputSystem extends System{
	static init( ecs, priority = 1 ){ ecs.addSystem( new InputSystem(), priority ); }

	constructor(){
		super();

		this.isActive	= false;	//
		this.mode		= 1;		//Which Mouse Mode to use
		this.state_c	= false;	//State of the C button
		this.wheelChg	= null;

		//Keep track of inital state for mode
		this.initRotation = new Quat();	
		this.initPosition = new Vec3();

		//Track last mouse change, so if no change, dont handle mouse movements
		this.lastYChange = 0;
		this.lastXChange = 0;
	}

	update( ecs ){
		//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
		// Handle Keyboard Input
		if( App.input.keyCount > 0 ) this.handleKeyboard();

		//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
		// Handle Mouse Wheel Change
		if( App.input.wheelUpdateOn !== this.wheelChg){
			this.wheelChg = App.input.wheelUpdateOn;

			let cc	= ( App.input.isCtrl() )? 5 : 1,
				v	= App.node.getDir( App.camera ).scale( KB_FORWARD_RATE * App.input.wheelValue * cc );
			App.camera.Node.addPos( v );
		}

		//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
		// Has mouse movement started, if so which mode to be in
		if( !App.input.leftMouse ){  //if(!Fungi.input.isMouseActive){
			this.isActive = false;		
			return;	
		}else if(!this.isActive){
			this.isActive = true;
			this.initRotation.copy( App.camera.Node.local.rot );
			this.initPosition.copy( App.camera.Node.local.pos );

			if( App.input.keyState[16] == true)			this.mode = 0; // Shift - Pan Mode
			else if( App.input.keyState[17] == true)	this.mode = 2; // Ctrl - Orbit Mode
			else 										this.mode = 1; // Look
		}

		//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
		// Only handle mouse Movements if there was a change since last frame.
		if(	this.lastYChange != App.input.coord.idy || 
			this.lastXChange != App.input.coord.idx ) this.handleMouse();

		this.lastYChange = App.input.coord.idy;
		this.lastXChange = App.input.coord.idx;
	}

	handleMouse(){
		let t = App.camera.Node.local,
			c = App.input.coord;

		switch(this.mode){
			//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
			// LOOK
			case 1:
				//Quaternion Way
				//var pos = Fungi.camera.getPosition()
				//			.add( Fungi.camera.left(null, c.pdx * this.mLookRate) )
				//			.add( Fungi.camera.up(null, c.pdy * -this.mLookRate) )
				//			.add( Fungi.camera.forward() )
				//			.sub( Fungi.camera.getPosition() );

				//Works just as good without local position as a starting point then 
				//subtracting it to make a Direction vector
				//var pos = Fungi.camera.left(null, c.pdx * this.mLookRate)
				//			.add( Fungi.camera.up(null, c.pdy * -this.mLookRate) )
				//			.add( Fungi.camera.forward() );
				//Fungi.camera.rotation = Quat.lookRotation(pos, Vec3.UP);

				//Euler Way
				let euler = Quat.toEuler( this.initRotation );
				euler[0] += c.idy * LOOK_RATE;
				euler[1] += c.idx * LOOK_RATE;

				t.rot.copy( Quat.fromEuler( null, euler[0], euler[1], 0, "YZX" ) );
				App.camera.Node.isModified = true;
			break;
			
			//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
			// ORBIT
			case 2:
				//Rotate the camera around X-Z
				let pos		= this.initPosition.clone(),
					lenXZ	= Math.sqrt( pos.x*pos.x + pos.z*pos.z ),
					radXZ	= Math.atan2( pos.z, pos.x ) + ORBIT_RATE * c.idx;

				pos[0]	= Math.cos(radXZ) * lenXZ;
				pos[2]	= Math.sin(radXZ) * lenXZ;

				//Then Rotate point around the the left axis
				let q = new Quat().setAxisAngle( App.node.getDir( App.camera, 1 ) , -c.idy * ORBIT_RATE );
				Quat.rotateVec3( q, pos, pos );

				//Save New Position, then update rotation
				t.pos.copy( pos );
				t.rot.copy( Quat.lookRotation( pos, Vec3.UP ) );
				App.camera.Node.isModified = true;
			break;

			//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~LOOK
			// PANNING
			default:
				let qq	= App.node.getWorldRot( App.camera ),
					v	= new Vec3();
				
				t.pos.copy( this.initPosition )
					.add( Vec3.transformQuat( Vec3.UP, qq, v ).scale( PAN_RATE * c.idy ) )		// Up - Down
					.add( Vec3.transformQuat( Vec3.LEFT, qq, v ).scale( PAN_RATE * -c.idx ) );	// Left - Right	

				App.camera.Node.isModified = true;
			break;
		}
	}

	handleKeyboard(){
		let key	= App.input.keyState,
			t	= App.camera.Node.local,
			ss	= ( App.input.isShift() )? 5.0 : 1.0;

		//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
		// C - Output Camera Position and Rotation
		// Only do operation on Key Up.
		if(!key[67] && this.state_c){
			this.state_c = false;

			let axis = t.rot.getAxisAngle();
			console.log(".setPos(%f, %f, %f)\n.setRotAxis([%f,%f,%f], %f);", 
				t.pos.x, t.pos.y, t.pos.z,
				axis[0], axis[1], axis[2], axis[3]
			);
			//console.log("Camera Length: %f", t.pos.length());
		}else if( key[67] && !this.state_c ) this.state_c = true;

		//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
		// Handle First Person Movement
		if( key[87] || key[83] || key[65] || key[68] ){
			let q = App.node.getWorldRot( App.camera ),
				v = new Vec3();

			// Forward / Backwards : w - s
			if(key[87] || key[83]){
				let s = (key[87])? KB_FORWARD_RATE : -KB_FORWARD_RATE;
				Vec3.transformQuat( Vec3.FORWARD, q, v ).scale( s * ss );	// Calc and Scale Forward Direction
				t.pos.add( v );												// Add it to camera's current local position.
			}

			// Left / Right : A - D
			if(key[65] || key[68]){
				let s = (key[68])? -KB_FORWARD_RATE : KB_FORWARD_RATE;
				Vec3.transformQuat( Vec3.LEFT, q, v ).scale( s * ss );
				t.pos.add( v );
			}

			App.camera.Node.isModified = true;
		}

		//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
		// Spin : Q - E
		if(key[81] || key[69]){
			let s = (key[69])? -KB_ROTATE_RATE : KB_ROTATE_RATE;
			Quat.mulAxisAngle( t.rot, Vec3.UP, s * ss);
			App.camera.Node.isModified = true;
		}
	}
}


//###########################################################################
export default InputSystem;