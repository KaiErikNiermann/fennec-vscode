# FenneC Language Support

## Overview

This extension aims to provide full comprehensive language support for FenneC, including C-style syntax highlighting, code snippets for basic constructs, and some basic IntelliSense information. Hopefully, this can make working with the language both faster and easier.

<img src="./assets/hover-info.png" alt="isolated" width="500" style="max-width: 100%"/>

## Features

- Mostly full C-style syntax highlighting 
- Snippets for basic constructs 
- Basic C-style IntelliSense for functions

## Known Issues

I put this together quite quickly so there might still be some issues. If you come across any problems/issues or have suggestions for enhancements, please don't hesitate to [raise them here](https://github.com/KaiErikNiermann/fennec-vscode/issues).

## Release Notes

### Version 0.0.3

- Small fixes to improve overall extension 

### Version 0.0.4

- Improved recognition of operators 
- Added highlighting for format strings

### Version 0.0.5

- Added snippets for most basic language constructs
- Further improvements to syntax highlighting for a larger coverage of lang spec

### Version 0.0.6

- Added a language server which enables hover information and some basic autocomplete

## Acknowledgements

The artist for the wonderful FenneC mascot is [Mei-Li Nieuwland](https://liea.nl/).

The FenneC language and its specification are inspired by (but not related to) the CiviC language which was invented by [Clemens Grelck](https://staff.science.uva.nl/c.u.grelck/) for the Compiler Construction course taught at the University of Amsterdam.

Finally credit to the teaching staff of the [Compiler Construction course](https://studiegids.vu.nl/en/Bachelor/2023-2024/computer-science/XB_0003#/) at VU Amsterdam for creating such an interesting course. I hope this extension can help people have as much fun with the assignments as I did.