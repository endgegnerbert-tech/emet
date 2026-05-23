import json

examples = [
    # Security
    ("CVE-2024-3094 xz utils", "security"),
    ("recent openssh vulnerability", "security"),
    ("log4j exploit mitigation", "security"),
    ("CVE-2023-44487 details", "security"),
    ("cisa advisory for ivanti", "security"),
    ("spring framework RCE", "security"),
    ("github security advisory GHSA-xxx", "security"),
    ("mitre cve database search", "security"),
    ("nvd severity for latest curl cve", "security"),
    ("is my server vulnerable to heartbleed", "security"),
    
    # Vendor-Status
    ("GitHub actions runner outage", "vendor-status"),
    ("is AWS us-east-1 down", "vendor-status"),
    ("cloudflare 502 bad gateway today", "vendor-status"),
    ("slack status page", "vendor-status"),
    ("npm registry incident report", "vendor-status"),
    ("vercel deployment failing outage", "vendor-status"),
    ("discord connection issues right now", "vendor-status"),
    ("openai api status", "vendor-status"),
    ("azure active directory degradation", "vendor-status"),
    ("datadog intake delayed", "vendor-status"),

    # Papers
    ("attention is all you need paper", "papers"),
    ("transformers arxiv 2017", "papers"),
    ("llama 3 technical report", "papers"),
    ("research paper on tokenization", "papers"),
    ("doi 10.1145/3357384.3357396", "papers"),
    ("scientific study on sleep and memory", "papers"),
    ("semantic scholar graph neural networks", "papers"),
    ("pubmed latest research on mrna", "papers"),
    ("nature article on quantum computing", "papers"),
    ("deepseek r1 math paper", "papers"),

    # Specs
    ("rfc 2616 http 1.1", "specs"),
    ("html5 w3c specification", "specs"),
    ("ecmascript 2024 language spec", "specs"),
    ("css grid standard", "specs"),
    ("whatwg fetch standard", "specs"),
    ("json rfc 8259", "specs"),
    ("oauth 2.0 specification", "specs"),
    ("webgl 2.0 reference", "specs"),
    ("openapi 3.1 standard", "specs"),
    ("posix standard signals", "specs"),

    # Package-Registry
    ("npm install lodash", "package-registry"),
    ("pypi requests package", "package-registry"),
    ("cargo add serde", "package-registry"),
    ("maven org.springframework", "package-registry"),
    ("gem install rails", "package-registry"),
    ("docker pull ubuntu", "package-registry"),
    ("go get github.com/gin-gonic/gin", "package-registry"),
    ("composer require guzzlehttp/guzzle", "package-registry"),
    ("nuget newtonsoft.json", "package-registry"),
    ("cran ggplot2 package", "package-registry"),

    # Github
    ("github pull request #123 on react", "github"),
    ("issue 54 on facebook/react", "github"),
    ("vercel next.js discussions", "github"),
    ("how to open a github issue", "github"),
    ("github repo torvalds/linux", "github"),
    ("tensorflow github commits", "github"),
    ("pytorch pull request review", "github"),
    ("github source code for fastapi", "github"),
    ("search github issues for bug", "github"),
    ("kubernetes github repository", "github"),

    # Changelog
    ("react 19 release notes", "changelog"),
    ("what is new in python 3.12", "changelog"),
    ("next.js changelog version 14", "changelog"),
    ("ubuntu 24.04 release history", "changelog"),
    ("latest updates in vscode", "changelog"),
    ("docker desktop release notes", "changelog"),
    ("vue 3.4 changelog", "changelog"),
    ("kubernetes v1.30 changelog", "changelog"),
    ("rust 1.77 release notes", "changelog"),
    ("postgres 16 version history", "changelog"),

    # Forums
    ("stackoverflow how to exit vim", "forums"),
    ("reddit r/programming", "forums"),
    ("discourse rust user forum", "forums"),
    ("hacker news discussion on ai", "forums"),
    ("stack overflow fix null pointer", "forums"),
    ("quora why is python popular", "forums"),
    ("reddit local llama fine tuning", "forums"),
    ("swift forums generics", "forums"),
    ("unity answers movement script", "forums"),
    ("stackexchange physics quantum", "forums"),

    # Web (General)
    ("how to boil an egg", "web"),
    ("best movies of 2023", "web"),
    ("weather in new york today", "web"),
    ("who is the ceo of microsoft", "web"),
    ("history of the roman empire", "web"),
    ("how does a car engine work", "web"),
    ("capital of france", "web"),
    ("population of tokyo", "web"),
    ("what is the speed of light", "web"),
    ("how to tie a tie", "web"),
]

with open("data/router/gold-domain.jsonl", "w") as f:
    for query, label in examples:
        d = {
            "query": query,
            "label": label,
            "rationale": f"Synthetic gold example for {label}",
            "inputText": query
        }
        f.write(json.dumps(d) + "\n")

print(f"Generated {len(examples)} gold domain examples.")
