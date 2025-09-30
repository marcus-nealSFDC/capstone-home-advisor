(function(){
  function ready(fn){ if(document.readyState!=='loading'){ fn(); } else { document.addEventListener('DOMContentLoaded', fn); } }

  function publish(eventName, payload){
    // Replace this with the real SDK call once the Web SDK snippet is installed.
    // For example (pseudo):
    //   window.sfdcInteractions && window.sfdcInteractions('publish', eventName, payload);
    // This helper avoids breaking the app if the SDK isn't loaded yet.
    try {
      if (window.sfdcInteractions && typeof window.sfdcInteractions === 'function') {
        // Uncomment and adjust when you know the exact method signature from your org's snippet:
        // window.sfdcInteractions('publish', eventName, payload);
        console.debug('[NuRF → SFDC SDK] (placeholder)', eventName, payload);
      } else {
        console.debug('[NuRF] SDK not loaded yet; captured', eventName, payload);
      }
    } catch (e) {
      console.warn('[NuRF] SDK publish failed:', e);
    }
  }

  ready(function(){
    var input = document.getElementById('input');
    var send = document.getElementById('send');

    if (send) {
      send.addEventListener('click', function(){
        var q = (input && input.value || '').trim();
        if (q) publish('ChatQuestionAsked', { query: q });
      });
    }

    // Track clicks to speaker profile links
    document.body.addEventListener('click', function(e){
      var a = e.target && e.target.closest ? e.target.closest('a') : null;
      if (!a) return;
      try {
        var url = new URL(a.href, window.location.origin);
        if (url.pathname.startsWith('/speakers/')) {
          publish('SpeakerProfileViewed', { path: url.pathname, href: a.href, text: a.textContent.trim() });
        }
        if (url.pathname.startsWith('/agenda')) {
          publish('AgendaLinkClicked', { path: url.pathname, href: a.href, text: a.textContent.trim() });
        }
      } catch (err) {}
    });

    // Basic page view
    publish('PageView', { path: window.location.pathname, title: document.title });
  });
})();