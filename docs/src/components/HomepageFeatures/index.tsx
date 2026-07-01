import type { ReactNode } from "react";
import clsx from "clsx";
import Heading from "@theme/Heading";
import styles from "./styles.module.css";
import Translate from "@docusaurus/Translate";

type FeatureItem = {
  title: ReactNode;
  Svg: React.ComponentType<React.ComponentProps<"svg">>;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: (<Translate id="homepage.features.what_is_sanny64.title">What is Sanny64?</Translate>),
    Svg: require("@site/static/img/undraw_docusaurus_mountain.svg").default,
    description: (
      <Translate id="homepage.features.what_is_sanny64.description">
        Sanny64 is my private website, which I mainly use as a portfolio, a
        helper for me to host events and for you to play some of my games.
      </Translate>
    ),
  },
  {
    title: (<Translate id="homepage.features.documentation.title">Documentation</Translate>),
    Svg: require("@site/static/img/undraw_docusaurus_tree.svg").default,
    description: (
      <Translate id="homepage.features.documentation.description">
        This is the documentation site for the Sanny64 workspace and explains 
        how the public site, login app, shared packages, and backend fit together.
      </Translate>
    ),
  },
  {
    title: (<Translate id="homepage.features.docusaurus.title">Docusaurus</Translate>),
    Svg: require("@site/static/img/undraw_docusaurus_react.svg").default,
    description: (
      <Translate id="homepage.features.docusaurus.description">
        Docusaurus is a modern static website generator that helps build
        optimized documentation pages quickly. It's built by Facebook, 
        open-source, and React-based.
      </Translate>
    ),
  },
];

function Feature({ title, Svg, description }: FeatureItem) {
  return (
    <div className={clsx("col col--4")}>
      <div className="text--center">
        <Svg className={styles.featureSvg} role="img" />
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
