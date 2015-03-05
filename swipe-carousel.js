/*global Polymer, Hammer */

function easeOutQuad(p) {
  return -1 * p * (p - 2);
}

function tween(obj, key, endVal, duration, ease, onComplete) {
  var stop = false;
  var startTime = +new Date();
  var startVal = obj[key];
  var range = endVal - startVal;
  var tick = function() {
    var elapsed = +new Date() - startTime;
    var p = (elapsed / duration);
    obj[key] = (startVal + range * ease(p));
    if (!stop && elapsed < duration) {
      requestAnimationFrame(tick);
    } else {
      obj[key] = endVal;
      if (onComplete) {
        onComplete();
      }
    }
  };
  tick();
  return {
    stop: function() {
      stop = true;
    }
  };
}


function clamp(i, min, max) {
  return Math.min(max, Math.max(min, i));
}

// allow i to asymptotically approach min-thresh or max+thresh
function stretchyClamp(i, min, max, thresh) {
  var clamped = Math.min(max, Math.max(min, i));
  if (i < min || i > max) {
    var sign = i < min ? -1 : +1;
    var overshoot = i < min ? min - i : i - max;
    var pct = overshoot / thresh;
    var r = thresh;
    var stretchAmount = r - r / Math.pow(2, pct / 4);
    var ret = clamped + sign * stretchAmount;
    return ret;
  } else {
    return clamped;
  }
}



Polymer('swipe-carousel', {
  // -- setup
  attached: function() {
    window.addEventListener('resize', this._resizeListener = this.onResize.bind(this));
    this.onMutation(this, this.onChildrenUpdated);
  },

  detached: function() {
    if (this.rAF) {
      window.cancelAnimationFrame(this.rAF);
      this.rAF = null;
    }
    window.removeEventListener(this._resizeListener);
  },

  domReady: function() {
    this.onChildrenUpdated(); // force the issue in case items are present initially (as opposed to templated in later)
  },

  onChildrenUpdated: function( /*observer, mutations*/ ) {
    this.job('chup', this.initCarousel.bind(this), 250); // safety debounce
    this.onMutation(this, this.onChildrenUpdated); // one-shot listener
  },

  updatePositions: function() {
    this.slides = [].slice.call(this.$.kontent.getDistributedNodes());
    this.lefts = this.slides.map(function(s) {
      return s.offsetLeft;
    });
    this.state.needsUpdate = false;

    // do some sanity checking for the poor user
    if (console && console.error) {
      if (this.slides.length === 0) {
        console.error('swipe-carousel found no items. Did you give its child elements the .swipe-carousel-item CSS class?');
      }
    }
  },

  onResize: function() {
    this.job('handle resize', this.updatePositions, 300);
  },


  // -- carousel action

  created: function() {
    this.selectedIndex = 0;
    this.state = {
      x: 0,
      pointerStartX: 0,
      panStartStripX: 0,
      anim: null,
      index: 0,
      needsUpdate: false
    };
    this.prevState = {};
  },


  initCarousel: function() {

    var self = this;
    var imageStrip = this.$.strip;
    var scrim = this.$.carousel__scrim;

    // immutable
    console.log('hammer=', Hammer);
    var ham = new Hammer(scrim, {});
    var DURATION = 500;
    var THRESH = 30; //this.$.carousel__scrim.clientWidth / 6;

    // mutable
    var state = this.state;
    var prevState = this.prevState;

    // dom and derived info
    this.updatePositions();

    function nullAnim() {
      state.anim = null;
    }

    function animateToIndex(i, ease) {
      if (state.anim) {
        state.anim.stop();
      }
      state.anim = tween(state, 'x', -self.lefts[i], DURATION, ease, nullAnim);
    }

    // rather than tween the target directly, we set up a state machine and tween
    // its values, polling it and updating when values change.
    function pollState() {
      if (state.x !== prevState.x) {
        imageStrip.style.transform = 'translateX(' + state.x.toFixed(3) + 'px)';
        imageStrip.style.webkitTransform = 'translateX(' + state.x.toFixed(3) + 'px)';
        prevState.x = state.x;
      }

      if (state.index !== prevState.index) {
        animateToIndex(state.index, easeOutQuad);
        prevState.index = state.index;
        self.selectedIndex = state.index;
      }

      if (state.needsUpdate) {
        animateToIndex(state.index, easeOutQuad);
        state.needsUpdate = false;
      }

      return requestAnimationFrame(pollState);
    }

    function panUnlessSwiped() {
      if (state.anim) {
        return; // we just swiped and are transitioning to prev/next
      }

      var offset = self.lefts[state.index] + state.x;
      if (offset < -THRESH) {
        state.index++;
      } else if (offset > THRESH) {
        state.index--;
      }
      state.index = clamp(state.index, 0, self.slides.length - 1);
      state.needsUpdate = true;
    }


    ham.on('swipe', function(e) {
      var d = (e.direction === Hammer.DIRECTION_LEFT ? 1 : -1);
      state.index = clamp(state.index + d, 0, self.slides.length - 1);
    });

    ham.on('panstart', function() {
      state.panStartStripX = state.x || 0;
    });

    ham.on('pan', function(e) {
      if (e.isFinal) {
        requestAnimationFrame(panUnlessSwiped);
      } else {
        var totalPointerOffset = e.deltaX;
        state.x = stretchyClamp(
          state.panStartStripX + Math.round(totalPointerOffset),
          -self.lefts[self.lefts.length - 1],
          0,
          THRESH * 3);
      }
    });

    ham.on('tap', function() {
      var item = self.slides[self.state.index];
      if (item.hasAttribute('href')) {
        self.fire('navigate', item.getAttribute('href'));
      }
      self.fire('tap-item', state.index);
    });

    this.rAF = pollState();
  }
});