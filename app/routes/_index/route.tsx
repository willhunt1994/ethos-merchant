import { useCallback, useRef, useState } from "react";
import type { TouchEvent } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (
    url.searchParams.get("shop") ||
    url.searchParams.get("host") ||
    url.searchParams.get("embedded")
  ) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

const LANDING_STEPS = [
  {
    step: 1,
    mediaType: "image" as const,
    src: "/assets/landing/feature-1.jpg",
    title: "Choose Products to Sell",
    bullets: [
      "Control which products to offer customization options on",
      "Sell Best Sellers",
      "Add overstock product to help push slow inventory",
    ],
  },
  {
    step: 2,
    mediaType: "video" as const,
    src: "/assets/landing/feature-2.mp4",
    title: "Specify Customization Options",
    bullets: [
      "Choose decoration type and logo placement",
      "No customization is OK",
      "Set parameters for our team to use",
    ],
  },
  {
    step: 3,
    mediaType: "image" as const,
    src: "/assets/landing/feature-3.avif",
    title: "Publish and Go Live",
    bullets: [
      "Start selling with Ethos Merch",
      "Track sales in your app dashboard",
      "Publish new products whenever you want",
    ],
  },
] as const;

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();
  const [activeStep, setActiveStep] = useState(0);
  const stepCount = LANDING_STEPS.length;

  const goToStep = useCallback(
    (index: number) => {
      setActiveStep((index + stepCount) % stepCount);
    },
    [stepCount],
  );

  const goPrev = useCallback(() => {
    goToStep(activeStep - 1);
  }, [activeStep, goToStep]);

  const goNext = useCallback(() => {
    goToStep(activeStep + 1);
  }, [activeStep, goToStep]);

  const touchStartX = useRef<number | null>(null);

  const handleTouchStart = useCallback((event: TouchEvent) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  }, []);

  const handleTouchEnd = useCallback(
    (event: TouchEvent) => {
      if (touchStartX.current === null) return;
      const endX = event.changedTouches[0]?.clientX;
      if (endX === undefined) return;

      const delta = endX - touchStartX.current;
      if (Math.abs(delta) >= 48) {
        if (delta < 0) goNext();
        else goPrev();
      }
      touchStartX.current = null;
    },
    [goNext, goPrev],
  );

  return (
    <div className={styles.index}>
      <div className={styles.pageBackdrop} aria-hidden>
        <video
          className={styles.panelVideo}
          src="/assets/landing/embroidery.mov"
          autoPlay
          muted
          loop
          playsInline
        />
      </div>
      <div className={styles.layout}>
        <header className={styles.siteHeader}>
          <div className={styles.siteBrand}>
            <h1 className={styles.brandHeading}>
              <img
                className={styles.brandLogo}
                src="/assets/ethos-logo-black.png"
                alt="Ethos Merch"
              />
            </h1>
          </div>

          {showForm && (
            <section className={styles.connectSection} aria-label="Connect shop">
              <div className={styles.connectCard}>
                <p className={styles.text}>
                  Sell your brand with customization on Ethos Merch
                </p>
                <Form className={styles.form} method="post" action="/auth/login">
                  <label className={styles.label}>
                    <input
                      className={styles.input}
                      type="text"
                      name="shop"
                      placeholder="Enter Shopify Domain"
                      aria-label="Shop domain"
                    />
                  </label>
                  <button className={styles.button} type="submit">
                    Get Started
                  </button>
                </Form>
              </div>
            </section>
          )}
        </header>

        <div className={styles.pagePanel}>
          <section
            className={styles.slideshow}
            aria-label="How Ethos Merch works"
            aria-roledescription="carousel"
          >
            <div
              className={styles.slideshowStack}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              <ul
                className={styles.slideshowTrack}
                style={
                  {
                    "--slide-index": activeStep,
                  } as React.CSSProperties
                }
              >
                {LANDING_STEPS.map((item) => (
                  <li
                    key={item.step}
                    className={styles.slide}
                    id={`landing-step-${item.step}`}
                  >
                    <div className={styles.slideCard}>
                      <div className={styles.featureMedia}>
                        {item.mediaType === "video" ? (
                          <video
                            src={item.src}
                            autoPlay
                            muted
                            loop
                            playsInline
                            aria-hidden
                          />
                        ) : (
                          <img src={item.src} alt="" />
                        )}
                      </div>
                      <div className={styles.featureText}>
                        <p className={styles.featureTitle}>
                          <strong>
                            {item.step}. {item.title}
                          </strong>
                        </p>
                        {"bullets" in item && item.bullets.length > 0 ? (
                          <ul className={styles.featureBullets}>
                            {item.bullets.map((bullet) => (
                              <li key={bullet}>{bullet}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className={styles.slideshowNav}>
              <button
                type="button"
                className={styles.slideshowArrow}
                onClick={goPrev}
                aria-label="Previous step"
              >
                ‹
              </button>
              <div className={styles.slideshowDots} role="tablist">
                {LANDING_STEPS.map((item, index) => (
                  <button
                    key={item.step}
                    type="button"
                    role="tab"
                    className={`${styles.slideshowDot} ${
                      index === activeStep ? styles.slideshowDotActive : ""
                    }`}
                    aria-selected={index === activeStep}
                    aria-controls={`landing-step-${item.step}`}
                    aria-label={`Step ${item.step}: ${item.title}`}
                    onClick={() => goToStep(index)}
                  />
                ))}
              </div>
              <button
                type="button"
                className={styles.slideshowArrow}
                onClick={goNext}
                aria-label="Next step"
              >
                ›
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
