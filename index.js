// createVerificationProfile calls the profile endpoint to get a profile Id, then calls enrollProfileAudioForVerification
function createVerificationProfile(blob) {
  // just check if we've already fully enrolled this profile
  if (verificationProfile && verificationProfile.profileId) {
    if (verificationProfile.remainingEnrollments == 0) {
      console.log("Verification enrollment already completed");
      return;
    } else {
      console.log(
        "Verification enrollments remaining: " +
          verificationProfile.remainingEnrollments
      );
      enrollProfileAudioForVerification(blob, verificationProfile.profileId);
      return;
    }
  }

  var create = `${baseApi}/verificationProfiles`;

  var request = new XMLHttpRequest();
  request.open("POST", create, true);
  request.setRequestHeader("Content-Type", "application/json");
  request.setRequestHeader("Ocp-Apim-Subscription-Key", key);

  request.onload = function() {
    console.log(request.responseText);
    var json = JSON.parse(request.responseText);
    var profileId = json.verificationProfileId;
    verificationProfile.profileId = profileId;

    // Now we can enrol this profile with the profileId
    enrollProfileAudioForVerification(blob, profileId);
  };

  request.send(JSON.stringify({ locale: "en-us" }));
}

// enrollProfileAudioForVerification enrolls the recorded audio with the new profile Id
function enrollProfileAudioForVerification(blob, profileId) {
  if (profileId == undefined) {
    console.log("Failed to create a profile for verification; try again");
    return;
  }

  var enroll = `${baseApi}/verificationProfiles/${profileId}/enroll`;

  var request = new XMLHttpRequest();
  request.open("POST", enroll, true);
  request.setRequestHeader("Ocp-Apim-Subscription-Key", key);
  request.onload = function() {
    console.log("enrolling");
    console.log(request.responseText);

    var json = JSON.parse(request.responseText);

    // need 3 successful enrolled chunks of audio per profile id
    verificationProfile.remainingEnrollments = json.remainingEnrollments;
    if (verificationProfile.remainingEnrollments == 0) {
      console.log("Verification should be enabled!");
    }
  };

  request.send(blob);
}

//-- Speaker Identification methods
// 1. Start the browser listening, listen for 15 seconds, pass the audio stream to "createProfile"
function enrollNewProfile() {
  navigator.getUserMedia(
    { audio: true },
    function(stream) {
      console.log("I'm listening... just start talking for a few seconds...");
      console.log(
        "Maybe read this: \n" +
          thingsToRead[Math.floor(Math.random() * thingsToRead.length)]
      );
      onMediaSuccess(stream, createProfile, 15);
    },
    onMediaError
  );
}

// createProfile calls the profile endpoint to get a profile Id, then calls enrollProfileAudio
function createProfile(blob) {
  var create = `${baseApi}/identificationProfiles`;

  var request = new XMLHttpRequest();
  request.open("POST", create, true);

  request.setRequestHeader("Content-Type", "application/json");
  request.setRequestHeader("Ocp-Apim-Subscription-Key", key);

  request.onload = function() {
    console.log("creating profile");
    console.log(request.responseText);

    var json = JSON.parse(request.responseText);
    var profileId = json.identificationProfileId;

    // Now we can enrol this profile using the profileId
    enrollProfileAudio(blob, profileId);
  };

  request.send(JSON.stringify({ locale: "en-us" }));
}

// enrollProfileAudio enrolls the recorded audio with the new profile Id, polling the status
function enrollProfileAudio(blob, profileId) {
  var enroll = `${baseApi}/identificationProfiles/${profileId}/enroll?shortAudio=true`;

  var request = new XMLHttpRequest();
  request.open("POST", enroll, true);
  request.setRequestHeader("Ocp-Apim-Subscription-Key", key);
  request.onload = function() {
    console.log("enrolling");
    console.log(request.responseText);

    // The response contains a location to poll for status
    var location = request.getResponseHeader("Operation-Location");

    if (location != null) {
      // ping that location to get the enrollment status
      pollForEnrollment(location, profileId);
    } else {
      console.log("Ugh. I can't poll, it's all gone wrong.");
    }
  };

  request.send(blob);
}

// Ping the status endpoint to see if the enrollment for identification has completed
function pollForEnrollment(location, profileId) {
  var enrolledInterval;

  // hit the endpoint every few seconds
  enrolledInterval = setInterval(function() {
    var request = new XMLHttpRequest();
    request.open("GET", location, true);
    request.setRequestHeader("Ocp-Apim-Subscription-Key", key);
    request.onload = function() {
      console.log("getting status");
      console.log(request.responseText);

      var json = JSON.parse(request.responseText);
      if (
        json.status == "succeeded" &&
        json.processingResult.enrollmentStatus == "Enrolled"
      ) {
        // Woohoo! The audio was enrolled successfully!

        // stop polling
        clearInterval(enrolledInterval);
        console.log("enrollment complete!");

        // ask for a name to associated with the ID to make the identification nicer
        var name = window.prompt("Who was that talking?");
        profileIds.push(new Profile(name, profileId));
        localStorage.setItem("profile", JSON.stringify(profileIds));
        console.log(profileId + " is now mapped to " + name);
      } else if (
        json.status == "succeeded" &&
        json.processingResult.remainingEnrollmentSpeechTime > 0
      ) {
        // stop polling, the audio wasn't viable
        clearInterval(enrolledInterval);
        console.log("That audio wasn't long enough to use");
      } else {
        // keep polling
        console.log("Not done yet..");
      }
    };

    request.send();
  }, 1000);
}

// 2. Start the browser listening, listen for 10 seconds, pass the audio stream to "identifyProfile"
function startListeningForIdentification() {
  if (profileIds.length > 0) {
    console.log("I'm listening... just start talking for a few seconds...");
    console.log(
      "Maybe read this: \n" +
        thingsToRead[Math.floor(Math.random() * thingsToRead.length)]
    );
    navigator.getUserMedia(
      { audio: true },
      function(stream) {
        onMediaSuccess(stream, identifyProfile, 10);
      },
      onMediaError
    );
  } else {
    console.log("No profiles enrolled yet! Click the other button...");
  }
}

// 3. Take the audio and send it to the identification endpoint
function identifyProfile(blob) {
  // comma delimited list of profile IDs we're interested in comparing against
  var Ids = profileIds.map(x => x.profileId).join();

  var identify = `${baseApi}/identify?identificationProfileIds=${Ids}&shortAudio=true`;

  var request = new XMLHttpRequest();
  request.open("POST", identify, true);

  //request.setRequestHeader('Content-Type','application/json');
  request.setRequestHeader("Ocp-Apim-Subscription-Key", key);

  request.onload = function() {
    console.log("identifying profile");
    console.log(request.responseText);

    // The response contains a location to poll for status
    var location = request.getResponseHeader("Operation-Location");

    if (location != null) {
      // ping that location to get the identification status
      pollForIdentification(location);
    } else {
      console.log("Ugh. I can't poll, it's all gone wrong.");
    }
  };

  request.send(blob);
}

// Ping the status endpoint to see if the identification has completed
function pollForIdentification(location) {
  var identifiedInterval;

  // hit the endpoint every few seconds
  identifiedInterval = setInterval(function() {
    var request = new XMLHttpRequest();
    request.open("GET", location, true);
    request.setRequestHeader("Ocp-Apim-Subscription-Key", key);

    request.onload = function() {
      console.log("getting status");
      console.log(request.responseText);

      var json = JSON.parse(request.responseText);
      if (json.status == "succeeded") {
        // Identification process has completed
        clearInterval(identifiedInterval);
        var speaker = profileIds.filter(function(p) {
          return p.profileId == json.processingResult.identifiedProfileId;
        });

        if (speaker != null && speaker.length > 0) {
          console.log("I think " + speaker[0].name + " was talking");
        } else {
          console.log("I couldn't tell who was talking. So embarrassing.");
        }
      } else {
        // Not done yet
        console.log("still thinking..");
        console.log(json);
      }
    };

    request.send();
  }, 500);
}

// Example phrases
var thingsToRead = [
  "Never gonna give you up\nNever gonna let you down\nNever gonna run around and desert you\nNever gonna make you cry\nNever gonna say goodbye\nNever gonna tell a lie and hurt you",
  "There's a voice that keeps on calling me\n	Down the road, that's where I'll always be.\n	Every stop I make, I make a new friend,\n	Can't stay for long, just turn around and I'm gone again\n	\n	Maybe tomorrow, I'll want to settle down,\n	Until tomorrow, I'll just keep moving on.\n	\n	Down this road that never seems to end,\n	Where new adventure lies just around the bend.\n	So if you want to join me for a while,\n	Just grab your hat, come travel light, that's hobo style.",
  "They're the world's most fearsome fighting team \n	They're heroes in a half-shell and they're green\n	When the evil Shredder attacks\n	These Turtle boys don't cut him no slack! \n	Teenage Mutant Ninja Turtles\nTeenage Mutant Ninja Turtles",
  "If you're seein' things runnin' thru your head \n	Who can you call (ghostbusters)\n	An' invisible man sleepin' in your bed \n	Oh who ya gonna call (ghostbusters) \nI ain't afraid a no ghost \n	I ain't afraid a no ghost \n	Who ya gonna call (ghostbusters) \n	If you're all alone pick up the phone \n	An call (ghostbusters)"
];

// vanilla javascript queystring management

// Get the Cognitive Services key from the querystring
var key = "2a5592de68ba4f79925fd87b45cc7ddc";
var baseApi = "https://westus.api.cognitive.microsoft.com/spid/v1.0";

// Speaker Recognition API profile configuration - constructs to make management easier
var Profile = class {
  constructor(name, profileId) {
    this.name = name;
    this.profileId = profileId;
  }
};
var VerificationProfile = class {
  constructor(name, profileId) {
    this.name = name;
    this.profileId = profileId;
    this.remainingEnrollments = 3;
  }
};

var profileIds = [];
var verificationProfile = new VerificationProfile();

(function() {
  // Cross browser sound recording using the web audio API
  navigator.getUserMedia =
    navigator.getUserMedia ||
    navigator.webkitGetUserMedia ||
    navigator.mozGetUserMedia ||
    navigator.msGetUserMedia;

  // Really easy way to dump the console logs to the page
  var old = console.log;
  var logger = document.getElementById("log");
  var isScrolledToBottom =
    logger.scrollHeight - logger.clientHeight <= logger.scrollTop + 1;

  console.log = function() {
    for (var i = 0; i < arguments.length; i++) {
      if (typeof arguments[i] == "object") {
        logger.innerHTML +=
          (JSON && JSON.stringify
            ? JSON.stringify(arguments[i], undefined, 2)
            : arguments[i]) + "<br />";
      } else {
        logger.innerHTML += arguments[i] + "<br />";
      }
      if (isScrolledToBottom)
        logger.scrollTop = logger.scrollHeight - logger.clientHeight;
    }
    old(...arguments);
  };
  console.error = console.log;
})();
