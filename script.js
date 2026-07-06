 (function(){
      var kbdHint = document.getElementById('kbdHint');
      kbdHint.textContent = navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? '⌘K' : 'Ctrl K';
      
      document.getElementById('trigger').addEventListener('click', function(){
        if(window.Spotlight) window.Spotlight.open();
      });
      
      document.getElementById('viewCode').addEventListener('click', function(){
        document.querySelector('.code-section').scrollIntoView({behavior:'smooth',block:'center'});
      });
      
      document.getElementById('copyBtn').addEventListener('click', function(){
        var text = '<script src="dist/spotlight.min.js"><\/script>';
        navigator.clipboard.writeText(text).then(function(){
          var btn = document.getElementById('copyBtn');
          btn.textContent = 'Copied';
          setTimeout(function(){ btn.textContent = 'Copy'; }, 1400);
        });
      });
    })();