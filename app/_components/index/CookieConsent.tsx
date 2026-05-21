// AUTO-SPLIT from app/_html/index.body.html by scripts/split-index-body.mjs
// Re-run the splitter to regenerate.
// @ts-nocheck
/* eslint-disable */

export default function CookieConsent() {
  return (
    <>
<dialog open={true} aria-label={"Cookie consent"} aria-describedby={"cookie-consent-description"} className={"cookie-consent cookie-consent--simple ui-light"} data-plugin={"cookieConsent"} id={"cookie-consent"}>
        <div className={"cookie-consent__container ui-background"}>
            <p id={"cookie-consent-description"} className={"cookie-consent__description"}>
                <span className={"cookie-consent__description__text text-c2 leading-trim"}>
                    This site collects
                </span>
                        
                                                                          
            

                    
                    
        
        
    <a className={"btn btn--link btn--text-smaller btn--clone"} target={"_blank"} rel={"noopener"} href={"privacy-policy.html"} data-plugin={" button"} data-button-clone-content={"true"}>

        <span className={"btn__content"}>
            
                                                    <span className={"btn__text  "}>
                                            cookies.
                    
                                    </span>
            
                    </span>
    </a>
            </p>

                    
                                                                          
            

                    
                    
        
        
    <a className={"btn btn--xs btn--outline btn--text-smaller btn--clone js-cookie-consent-accept"} aria-label={"allow cookies"} data-plugin={" button"} data-button-clone-content={"true"} tabIndex={"0"} role={"button"}>

        <span className={"btn__content"}>
            
                                                    <span className={"btn__text  "}>
                                            accept
                    
                                    </span>
            
                    </span>
    </a>
        </div>
    </dialog>
    </>
  );
}
