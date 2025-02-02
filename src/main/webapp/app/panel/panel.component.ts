import { Component, OnInit, Input } from '@angular/core';
import { TrialService } from '../service/trial.service';
import * as _ from 'lodash';
import { Genomic } from '../genomic/genomic.model';
import { Clinical } from '../clinical/clinical.model';
import { MovingPath } from './movingPath.model';
import { Arm } from '../arm/arm.model';
@Component({
    selector: 'jhi-panel',
    templateUrl: './panel.component.html',
    styleUrls: ['panel.scss']
})
export class PanelComponent implements OnInit {
    @Input() path = '';
    // used to manage the icons to be displayed
    @Input() type = '';
    @Input() unit = {};
    @Input() arm = false;
    finalPath = [];
    message = '';
    addNode = false;
    moving = false;
    nodeOptions: Array<string> = ['Genomic', 'Clinical', 'And', 'Or'];
    nodeType = '';
    selectedItems = [];
    operationPool: {};
    movingPath: MovingPath;
    dataBlockToMove = {};
    currentPath = '';
    dropdownList = ['Genomic', 'Clinical'];
    armInput: Arm;
    originalMatch = [];
    originalArms = [];
    dataToModify = [];
    allSubTypesOptions = this.trialService.getAllSubTypesOptions();
    subToMainMapping = this.trialService.getSubToMainMapping();
    mainTypesOptions = this.trialService.getMainTypesOptions();
    statusOptions = this.trialService.getStatusOptions();
    nctIdChosen: string;
    isPermitted = this.trialService.isPermitted;
    trialChosen: {};
    genomicInput: Genomic;
    clinicalInput: Clinical;
    clinicalFields = ['age_numerical', 'oncotree_primary_diagnosis'];
    genomicFields = ['hugo_symbol', 'annotated_variant', 'matching_examples', 'germline', 'protein_change', 'wildcard_protein_change',
    'variant_classification', 'variant_category', 'exon', 'cnv_call', 'wildtype', 'ms_status', 'mmr_status', 'fusion_partner_hugo_symbol'];
    oncokbGenomicFields = ['hugo_symbol', 'annotated_variant', 'germline'];
    oncokb: boolean;
    hasErrorInputField: boolean;
    copyMatch = false;

    constructor(private trialService: TrialService) {
    }

    ngOnInit() {
        this.trialService.nctIdChosenObs.subscribe((message) => this.nctIdChosen = message);
        this.trialService.trialChosenObs.subscribe((message) => {
            this.trialChosen = message;
            this.originalMatch = this.trialChosen['treatment_list'].step[0].match;
            this.originalArms = this.trialChosen['treatment_list'].step[0].arm;
        });
        this.trialService.genomicInputObs.subscribe((message) => {
            this.genomicInput = message;
        });
        this.trialService.clinicalInputObs.subscribe((message) => {
            this.clinicalInput = message;
        });
        this.trialService.operationPoolObs.subscribe((message) => {
            this.operationPool = message;
        });
        this.trialService.currentPathObs.subscribe((message) => {
            this.currentPath = message;
        });
        this.trialService.movingPathObs.subscribe((message) => {
            this.movingPath = message;
        });
        this.trialService.armInputObs.subscribe((message) => {
            this.armInput = message;
        });
        this.trialService.hasErrorInputFieldObs.subscribe((message) => {
            this.hasErrorInputField = message;
        });
        this.oncokb = this.trialService.oncokb;
    }
    preparePath(pathParameter?: string) {
        const pathStr = pathParameter ? pathParameter : this.path;
        const pathArr = _.without(pathStr.split(','), '');
        let locationToChange: any = [];
        if (pathArr[0] === 'match') {
            locationToChange = this.originalMatch;
            this.dataToModify = this.originalMatch;
            pathArr.shift();
        } else if (pathArr[0] === 'arm') {
            locationToChange = this.originalArms[pathArr[1]].match;
            this.dataToModify = this.originalArms[pathArr[1]].match;
            pathArr.shift();
            pathArr.shift();
        }
        this.message = '';
        this.finalPath = [];
        for (let i = 0; i < pathArr.length; i++) {
            const point = pathArr[i].trim();
            this.finalPath.push(point);
            if (point.length > 0 && locationToChange[point]) {
                locationToChange = locationToChange[point];
                if (locationToChange.and) {
                    locationToChange = locationToChange.and;
                    this.finalPath.push('and');
                } else if (locationToChange.or) {
                    locationToChange = locationToChange.or;
                    this.finalPath.push('or');
                } else {
                    // case: the first time add nodes to match under each arm
                    // this.dataToModify = this.dataToModify[point].match;
                }
            }
        }
    }
    getNodeType(type: string) {
        if (this.arm) {
            return 'Arm';
        } else if (_.isUndefined(type) || type.length === 0) {
            const keys = _.keys(this.unit);
            if (keys.length === 1) {
                return keys[0].replace(/\b\w/g, (l) => l.toUpperCase());
            }
        }
        return type;
    }
    modifyNode(type: string) {
        let result = true;
        let hasEmptySections = false;
        // validate the need to proceed
        if (type === 'delete') {
            result = confirm('This will delete the entire section. Are you sure you want to proceed?');
        } else {
            const nodeType = this.getNodeType(this.nodeType);
            hasEmptySections = this.hasEmptySections(nodeType);
        }

        if (result && (type === 'delete' || !hasEmptySections)) {
            if (this.arm === true) {
                this.modifyArmGroup(type);
            } else {
                this.preparePath();
                this.modifyData(this.dataToModify, this.finalPath, type);
            }
            this.saveBacktoDB().then((isSaved) => {
                if (isSaved && type === 'update') {
                    this.cancelModification();
                }
            });
        }
    }
    hasEmptyGenomicFields(obj: any) {
        let genomicFieldsToCheck = this.oncokbGenomicFields;
        if (!this.oncokb) {
            genomicFieldsToCheck = _.without(this.genomicFields, 'matching_examples');
        }
        for (const key of genomicFieldsToCheck) {
            if (!_.isUndefined(obj[key]) && obj[key].length > 0) {
                return false;
            }
        }
        return true;
    }
    hasEmptyClinicalFields(obj: any) {
        // Check clinical input fields
        // TODO: Use clinicalFields to replace the array after we remove main_type input field
        const clinicalFieldsToCheck = ['age_numerical', 'sub_type', 'main_type'];
        for (const key of clinicalFieldsToCheck) {
            if (!_.isUndefined(obj[key]) && obj[key].length > 0) {
                return false;
            }
        }
        return true;
    }
    hasEmptyArmFields(obj: any) {
        if (!_.isUndefined(obj['arm_description']) && obj['arm_description'].length > 0) {
            return false;
        }
        return true;
    }
    getEmptySectionNames(type: string, emptySections: Array<string>) {
        switch (type) {
        case 'Genomic':
            if (this.hasEmptyGenomicFields(this.genomicInput)) {
                emptySections.push('Genomic');
            }
            break;
        case 'Clinical':
            if (this.hasEmptyClinicalFields(this.clinicalInput)) {
                emptySections.push('Clinical');
            }
            break;
        case 'Arm':
            if (this.hasEmptyArmFields(this.armInput)) {
                emptySections.push('Arm');
            }
            break;
        case 'And':
        case 'Or':
            for (const item of this.selectedItems) {
                this.getEmptySectionNames(item, emptySections);
            }
            break;
        }
        return emptySections;
    }
    hasEmptySections(type: string) {
        // Check genomic input fields
        let emptySections = this.getEmptySectionNames(type, []);
        if (emptySections.length > 0) {
            emptySections = _.uniq(emptySections);
            let warnMessage = 'Please enter information in ' + emptySections.join(' and ');
            if (emptySections.length > 1) {
                warnMessage += ' sections!';
            } else {
                warnMessage += ' section!';
            }
            alert(warnMessage);
            return true;
        }
        return false;
    }
    saveBacktoDB() {
        return new Promise((resolve, reject) => {
            this.trialService.getRef('Trials/' + this.nctIdChosen + '/treatment_list/step/0').set({
                arm: this.originalArms,
                match: this.originalMatch
            }).then((result) => {
                console.log('save successfully!');
                this.clearInput();
                resolve(true);
            }).catch((error) => {
                console.log('Failed to save to DB ', error);
                const errorMessage = 'Sorry, this node is failed to save to database. Please make a copy of your data. Thanks!';
                this.trialService.saveErrors(
                    errorMessage,
                    {
                        arm: this.originalArms,
                        match: this.originalMatch
                    },
                    error);
                alert(errorMessage);
                reject(false);
            });
        });
    }
    modifyData(obj: Array<any>, path: Array<string>, type: string) {
        switch (type) {
            case 'delete':
            case 'remove':
                // different condition check between and/or node and genomic/clinical node
                if (path.length === 2 && (path[1] === 'and' || path[1] === 'or') || path.length === 1) {
                    if (type === 'remove') {
                        this.dataBlockToMove = _.clone(obj[path[0]]);
                        obj[path[0]].toBeRemoved = true;
                    } else {
                        obj.splice(Number(path[0]), 1);
                    }
                } else {
                    const index = path.shift();
                    this.modifyData(obj[index], path, type);
                }
                break;
            case 'copy':
                if (_.isEmpty(path)) {
                    // The who match node is copied.
                    this.copyMatch = true;
                    this.dataBlockToMove = _.clone(obj);
                } else if (path.length === 2 && (path[1] === 'and' || path[1] === 'or') || path.length === 1) {
                    this.dataBlockToMove = _.clone(obj[path[0]]);
                } else {
                    const index = path.shift();
                    this.modifyData(obj[index], path, type);
                }
                break;
            case 'update':
                if (path.length === 1) {
                    if (obj[path[0]].hasOwnProperty('genomic')) {
                        obj[path[0]] = this.prepareGenomicNodes(this.prepareGenomicData());
                    } else if (obj[path[0]].hasOwnProperty('clinical')) {
                        obj[path[0]] = this.prepareClinicalNodes(this.prepareClinicalData());
                    }
                } else {
                    const index = path.shift();
                    this.modifyData(obj[index], path, type);
                }
                break;
            case 'add':
                if (path.length === 0) {
                    this.addNewNode(obj);
                } else if (path.length === 1) {
                    if (obj.hasOwnProperty('and')) {
                        this.addNewNode(obj['and']);
                    } else if (obj.hasOwnProperty('or')) {
                        this.addNewNode(obj['or']);
                    }
                } else {
                    const index = path.shift();
                    this.modifyData(obj[index], path, type);
                }
                break;
            case 'exchange':
                if (path.length === 2) {
                    this.exchangeLogic(obj[path[0]]);
                } else {
                    const index = path.shift();
                    this.modifyData(obj[index], path, type);
                }
                break;
            default:
                break;
        }
    }
    clearInput() {
        this.selectedItems = [];
        this.addNode = false;
        this.nodeType = '';
        this.clearNodeInput();
    }
    clearNodeInput() {
        this.trialService.setGenomicInput(this.trialService.createGenomic());
        this.trialService.setClinicalInput(this.trialService.createClinical());
    }
    clearInputForm(keys: Array<string>, type: string) {
        if (type === 'Genomic') {
            for (const key of keys) {
                this.genomicInput[key] = '';
                this.genomicInput['no_' + key] = false;
            }
        } else if (type === 'Clinical') {
            for (const key of keys) {
                this.clinicalInput[key] = '';
                this.clinicalInput['no_' + key] = false;
            }
        } else if (type === 'arm') {
            for (const key of keys) {
                this.armInput[key] = '';
            }
        }
    }
    getOncotree() {
        let oncotree_primary_diagnosis = '';
        if (this.clinicalInput.sub_type) {
            oncotree_primary_diagnosis = this.clinicalInput.sub_type;
        }else if (this.clinicalInput.main_type) {
            oncotree_primary_diagnosis = this.clinicalInput.main_type;
        }
        return oncotree_primary_diagnosis;
    }
    prepareClinicalData() {
        this.clinicalInput['oncotree_primary_diagnosis'] = this.getOncotree();
        const clinicalToSave = _.clone(this.clinicalInput);
        delete clinicalToSave['main_type'];
        delete clinicalToSave['sub_type'];
        this.prepareSectionByField('clinical', clinicalToSave);
        return clinicalToSave;
    }
    prepareGenomicData() {
        const genomicToSave = _.clone(this.genomicInput);
        this.prepareSectionByField('genomic', genomicToSave);
        return genomicToSave;
    }
    prepareSectionByField(type: string, nodeData: object) {
        let keysToCheck = [];
        if (type === 'clinical') {
            keysToCheck = this.clinicalFields;
        } else if (type === 'genomic') {
            keysToCheck = this.genomicFields;
        }
        for (const key of keysToCheck) {
            // remove empty fields
            if (!_.isUndefined(nodeData[key]) && nodeData[key].length === 0) {
                delete nodeData[key];
            }
            // apply not logic
            if (nodeData['no_' + key]) {
                if (key === 'annotated_variant') {
                    const annotatedVariants = nodeData[key].split(',');
                    nodeData[key] = '!' + nodeData[key];
                    if (annotatedVariants.length > 1) {
                        nodeData[key] = '';
                        _.forEach(annotatedVariants, function(variant) {
                            nodeData[key] += '!' + variant.trim() + ',';
                        });
                        nodeData[key] = nodeData[key].slice(0, -1);
                    }
                } else {
                    nodeData[key] = '!' + nodeData[key];
                }
            }
            delete nodeData['no_' + key];
        }
    }
    // Generate multiple genomic nodes if annotated_variant is an array.
    prepareGenomicNodes(genomicNode: object) {
        if (!_.isUndefined(genomicNode['annotated_variant']) && genomicNode['annotated_variant'].includes(',')) {
            const annotatedVariants = genomicNode['annotated_variant'].split(',');
            const genomicNodeToSave = { and: [] };
            _.forEach(annotatedVariants, function(variant) {
                if (!_.isEmpty(variant)) {
                    const genomicNodeCopy = _.clone(genomicNode);
                    genomicNodeCopy['annotated_variant'] = variant.trim();
                    genomicNodeToSave['and'].push({
                        genomic: genomicNodeCopy
                    });
                }
            });
            return genomicNodeToSave;
        } else {
            return { genomic: genomicNode };
        }
    }
    // Generate 'And' node for age range
    prepareClinicalNodes(clinicalNode: Clinical) {
        if (!_.isUndefined(clinicalNode['age_numerical']) && clinicalNode['age_numerical'].includes(',')) {
            const ageGroups = clinicalNode['age_numerical'].split(',');
            ageGroups[0] = ageGroups[0].trim();
            ageGroups[1] = ageGroups[1].trim();
            const clinicalNodeToSave = {
                and: []
            };
            const tempClinicalNode0 = _.clone( clinicalNode );
            tempClinicalNode0[ 'age_numerical' ] = ageGroups[0];
            clinicalNodeToSave[ 'and' ].push( { clinical: tempClinicalNode0 } );
            const tempClinicalNode1 = _.clone( clinicalNode );
            tempClinicalNode1[ 'age_numerical' ] = ageGroups[1];
            clinicalNodeToSave[ 'and' ].push( { clinical: tempClinicalNode1 } );
            return clinicalNodeToSave;
        } else {
            return {clinical: clinicalNode};
        }
    }
    addNewNode(obj: Array<any>) {
        let emptyObj = false;
        if (_.isEmpty(this.dataBlockToMove)) {
            switch (this.nodeType) {
                case 'Genomic':
                    obj.push(this.prepareGenomicNodes(this.prepareGenomicData()));
                    break;
                case 'Clinical':
                    obj.push(this.prepareClinicalNodes(this.prepareClinicalData()));
                    break;
                case 'And':
                case 'Or':
                    const tempObj1: any = [];
                    for (const item of this.selectedItems) {
                        switch (item) {
                            case 'Genomic':
                                tempObj1.push(this.prepareGenomicNodes(this.prepareGenomicData()));
                                break;
                            case 'Clinical':
                                tempObj1.push(this.prepareClinicalNodes(this.prepareClinicalData()));
                                break;
                        }
                    }
                    if (_.isEmpty(tempObj1)) {
                        emptyObj = true;
                    }
                    const tempObj2: any = {};
                    if (this.nodeType === 'And') {
                        tempObj2.and = tempObj1;
                    } else if (this.nodeType === 'Or') {
                        tempObj2.or = tempObj1;
                    }
                    obj.push(tempObj2);
                    break;
            }
        } else {
            if (this.copyMatch) {
                _.forEach(this.dataBlockToMove, function(item){
                    obj.push(item);
                });
            } else {
                obj.push(this.dataBlockToMove);
            }
        }
        if (!emptyObj) {
            // Do not sort object when add a empty object.
            // If the empty object is put on the index 0 position, Firebase will delete it automatically and
            // index order will be messed up.
            obj.sort(this.sortModifiedArray);
        }
    }
    exchangeLogic(obj: any) {
        if (obj.hasOwnProperty('or')) {
            obj['and'] = obj['or'];
            delete obj['or'];
        } else if (obj.hasOwnProperty('and')) {
            obj['or'] = obj['and'];
            delete obj['and'];
        }
    }
    sortModifiedArray(a: object, b: object) {
        const keys = ['genomic', 'clinical', 'and', 'or'];
        return keys.indexOf(Object.keys(a)[0]) - keys.indexOf(Object.keys(b)[0]);
    }
    editNode() {
        // Reset hasErrorInputField to false so "save/add" button won't be disabled for previous check result.
        this.trialService.setHasErrorInputField(false);
        this.operationPool['currentPath'] = this.path;
        this.operationPool['editing'] = true;
        if (this.unit.hasOwnProperty('genomic')) {
            this.trialService.setGenomicInput(_.clone(this.unit['genomic']));
            this.setNotLogic('genomic');
        } else if (this.unit.hasOwnProperty('clinical')) {
            this.trialService.setClinicalInput(_.clone(this.unit['clinical']));
            this.setNotLogic('clinical');
            this.setOncotree();
        } else if (this.unit.hasOwnProperty('arm_description')) {
            const armToAdd: Arm = {
                arm_code: this.unit['arm_code'],
                arm_suspended: this.unit['arm_suspended'],
                arm_description: this.unit['arm_description'],
                arm_internal_id: this.unit['arm_internal_id'],
                arm_type: this.unit['arm_type'],
                arm_info: this.unit['arm_info'],
                arm_eligibility: this.unit['arm_eligibility'],
                drugs: this.unit['drugs'],
                match: this.unit['match']
            };
            this.trialService.setArmInput(armToAdd);
        }
    }
    setOncotree() {
        const oncotree_primary_diagnosis = this.clinicalInput['oncotree_primary_diagnosis'];
        this.clinicalInput['sub_type'] = '';
        this.clinicalInput['main_type'] = '';
        let isSubtype = false;
        for (const item of this.allSubTypesOptions) {
            if (item === oncotree_primary_diagnosis) {
                this.clinicalInput['sub_type'] = oncotree_primary_diagnosis;
                this.clinicalInput['main_type'] = this.subToMainMapping[oncotree_primary_diagnosis];
                isSubtype = true;
            }
        }
        if (isSubtype === false) {
            for (const item of this.mainTypesOptions) {
                if (item === oncotree_primary_diagnosis) {
                    this.clinicalInput['main_type'] = oncotree_primary_diagnosis;
                }
            }
        }
    }
    setNotLogic(type: string) {
        if (type === 'clinical') {
            for (const key of this.clinicalFields) {
                if (!_.isUndefined(this.clinicalInput[key]) && this.clinicalInput[key].startsWith('!')) {
                    this.clinicalInput['no_' + key] = true;
                    this.clinicalInput[key] = this.clinicalInput[key].substr(1);
                }
            }
        } else if (type === 'genomic') {
            for (const key of this.genomicFields) {
                if (!_.isUndefined(this.genomicInput[key]) && this.genomicInput[key].startsWith('!')) {
                    this.genomicInput['no_' + key] = true;
                    this.genomicInput[key] = this.genomicInput[key].substr(1);
                }
            }
        }
    }
    preAddNode() {
        this.addNode = true;
        if (this.arm === true) {
            if (this.trialService.oncokb) {
                this.clearInputForm(['arm_code', 'arm_description', 'arm_internal_id', 'arm_suspended', 'match', 'arm_type',
                    'arm_info', 'arm_eligibility', 'drugs'], 'arm');
            } else {
                this.clearInputForm(['arm_code', 'arm_description', 'arm_internal_id', 'arm_suspended', 'match'], 'arm');
            }
        }
    }
    moveNode() {
        if (this.operationPool['relocate'] === true) {
            this.operationPool['currentPath'] = '';
            this.operationPool['relocate'] = false;
        } else {
            this.operationPool['currentPath'] = this.path;
            this.operationPool['relocate'] = true;
            this.movingPath.from = this.path;
        }
    }
    copyNode() {
        if (this.operationPool['copy'] === true) {
            // click twice for canceling copy operation
            this.operationPool['currentPath'] = '';
            this.operationPool['copy'] = false;
        } else {
            this.operationPool['currentPath'] = this.path;
            this.operationPool['copy'] = true;
            this.movingPath.from = this.path;
        }
    }
    cancelModification() {
        this.operationPool['currentPath'] = '';
        this.operationPool['editing'] = false;
    }
    saveModification() {
        this.modifyNode('update');
    }
    dropDownNode() {
        this.operationPool['relocate'] = false;
        this.operationPool['currentPath'] = '';
        this.movingPath.to = this.path;
        // find the data to be moved and mark it as to be removed.
        // We can't remove it at this step because it will upset the path for the destination node
        this.preparePath(this.movingPath.from);
        this.modifyData(this.dataToModify, this.finalPath, 'remove');
        // add the data to destination node
        this.preparePath(this.movingPath.to);
        this.modifyData(this.dataToModify, this.finalPath, 'add');
        // remove the original data that has been moved to the destination
        this.removeOriginalNode(this.originalMatch);
        for (const arm of this.originalArms) {
            this.removeOriginalNode(arm.match);
        }
        this.dataBlockToMove = {};
        this.saveBacktoDB();
    }
    addCopiedNode() {
        this.operationPool['currentPath'] = '';
        this.movingPath.to = this.path;
        // find the data to be moved and mark it as to be removed.
        // We can't remove it at this step because it will upset the path for the destination node
        this.preparePath(this.movingPath.from);
        this.operationPool['copy'] = false;
        if (this.arm) {
            const copiedArmPathArr = this.movingPath.from.split(',');
            const armToAdd: Arm = this.originalArms[copiedArmPathArr[copiedArmPathArr.length - 1]];
            this.modifyArmGroup('add', armToAdd);
        } else {
            this.modifyData(this.dataToModify, this.finalPath, 'copy');
            // add the data to destination node
            this.preparePath(this.movingPath.to);
            this.modifyData(this.dataToModify, this.finalPath, 'add');
        }
        this.dataBlockToMove = {};
        this.saveBacktoDB();
    }
    removeOriginalNode(match: Array<any>) {
        const itemsToRemove = [];
        for (const item of match) {
            if (item.toBeRemoved === true) {
                itemsToRemove.push(item);
            }
        }
        for (const item of itemsToRemove) {
            match.splice(match.indexOf(item), 1);
        }
        for (const item of match) {
            if (_.keys(item).indexOf('and') !== -1) {
                this.removeOriginalNode(item['and']);
                // After original node is removed, we should check if its parent node is empty.
                // If yes, we should also remove its parent node. Otherwise, the array index will be messed up in firebase.
                if (_.isEmpty(item['and'])) {
                    match.splice(match.indexOf(item), 1);
                }
            } else if (_.keys(item).indexOf('or') !== -1) {
                this.removeOriginalNode(item['or']);
                if (_.isEmpty(item['or'])) {
                    match.splice(match.indexOf(item), 1);
                }
            }
        }
    }
    isNestedInside(currentPath: string, destinationPath: string) {
        const currentPathArr = currentPath.split(',');
        const destinationPathArr = destinationPath.split(',');
        let isInside = true;
        if (currentPathArr.length < destinationPathArr.length) {
            _.some(currentPathArr, function(item, index) {
                if (item !== destinationPathArr[index]) {
                    isInside = false;
                    return true;
                }
            });
        } else {
            isInside = false;
        }
        return isInside;
    }
    // when user try to move a section, we hide all icons except the relocate icon to avoid distraction. Among which, there are 2 cases the destination icons are hidden
    // 1) The section is the current chosen one to move around.
    // 2) The section is inside the current chosen section.
    displayMoveDestination() {
        if (this.isPermitted === false) { return false; }
        return this.type.indexOf('destination') !== -1 && this.operationPool['relocate'] === true
            && this.operationPool['copy'] !== true && this.operationPool['currentPath'] !== this.path &&
            !this.isNestedInside(this.operationPool['currentPath'], this.path);
    }
    // Hide other destination buttons(match, and, or) except root 'arm' when copy an arm.
    displayCopyDestination() {
        if (this.isPermitted === false) { return false; }
        // Show root 'arm' destination button when copy an arm
        if (this.arm && this.path === 'arms') {
            return this.type.indexOf('copyArm') !== -1 && this.operationPool['copy'] &&
                this.operationPool['currentPath'].includes('arm_description');
        }
        if (this.type.indexOf('copyMatch') !== -1) {
            return this.operationPool['copy'] && this.operationPool['currentPath'] !== this.path && !this.operationPool['currentPath'].includes('arm_description') &&
                !this.isNestedInside(this.operationPool['currentPath'], this.path);
        }
        // Hide other destination button except root 'arm' when copy an arm
        if (!_.isUndefined(this.operationPool['currentPath']) && this.operationPool['currentPath'].includes(',')) {
            const currentPathArr = this.operationPool['currentPath'].split(',');
            if (currentPathArr.length === 2 && currentPathArr[0] === 'arm_description' && Number(currentPathArr[1]) >= 0) {
                return false;
            }
        }
        return this.type.indexOf('destination') !== -1 && this.path !== 'arms' &&
            this.operationPool['relocate'] !== true &&
            (this.operationPool['copy'] === true && this.operationPool['currentPath'] !== this.path &&
                !this.isNestedInside(this.operationPool['currentPath'], this.path));
    }
    displayPencil() {
        if (this.isPermitted === false) { return false; }
        return this.type.indexOf('edit') !== -1 && this.operationPool['relocate'] !== true &&
            this.operationPool['copy'] !== true && this.operationPool['currentPath'] !== this.path;
    }
    displayAdd() {
        if (this.isPermitted === false) { return false; }
        return this.type.indexOf('add') !== -1 && this.operationPool['relocate'] !== true &&
            this.operationPool['copy'] !== true;
    }
    // There are three cases we display the trash icon
    // 1) when the page is first loaded
    // 2) when the item is not the current editing one
    displayTrash() {
        if (this.isPermitted === false) { return false; }
        return this.type.indexOf('delete') !== -1 && (this.operationPool['relocate'] !== true &&
            this.operationPool['copy'] !== true && this.operationPool['editing'] !== true
        || this.operationPool['editing'] === true && this.operationPool['currentPath'] !== this.path);
    }
    // There are three cases we display the move icon
    // 1) when the page is first loaded
    // 2) when the item is not the current editing one
    // 3) when the item is the one we chose to move around
    displayMove() {
        if (this.isPermitted === false) { return false; }
        return this.type.indexOf('relocate') !== -1 && this.operationPool['copy'] !== true &&
            (this.operationPool['relocate'] !== true && this.operationPool['editing'] !== true
        || this.operationPool['editing'] === true && this.operationPool['currentPath'] !== this.path
        || this.operationPool['relocate'] === true && this.operationPool['currentPath'] === this.path);
    }
    displayExchange() {
        if (this.isPermitted === false) { return false; }
        return this.type.indexOf('exchange') !== -1 && this.operationPool['relocate'] !== true &&
            this.operationPool['copy'] !== true;
    }
    displayCopy() {
        if (this.isPermitted === false) { return false; }
        return this.type.indexOf('copy') !== -1 && !this.type.includes('copyArm') && this.operationPool['relocate'] !== true &&
            (this.operationPool['copy'] !== true && this.operationPool['editing'] !== true
            || this.operationPool['editing'] === true && this.operationPool['currentPath'] !== this.path
            || this.operationPool['copy'] === true && this.operationPool['currentPath'] === this.path);
    }
    modifyArmGroup(type, arm?: Arm) {
        if (type === 'add') {
            if (_.isUndefined(arm)) {
                const armToAdd: Arm = {
                    arm_code: '',
                    arm_description: '',
                    arm_internal_id: '',
                    arm_suspended: '',
                    arm_type: '',
                    arm_eligibility: '',
                    arm_info: '',
                    drugs: [],
                    match: []
                };
                this.prepareArmData(this.armInput, armToAdd);
                arm = armToAdd;
            }
            this.originalArms.push(arm);
        } else if (type === 'delete') {
            const tempIndex = Number(this.path.split(',')[1].trim());
            this.originalArms.splice(tempIndex, 1);
        } else if (type === 'update') {
            const tempIndex = this.path.split(',')[1].trim();
            this.prepareArmData(this.armInput, this.originalArms[tempIndex]);
        }
    }
    prepareArmData(armInput: Arm, armToSave: Arm) {
        const keys = _.keys(armInput);
        _.forEach(keys, function(key) {
            if (!_.isUndefined(armInput[key])) {
                armToSave[key] = armInput[key];
            }
            if (_.isEmpty(armInput[key])) {
                delete armToSave[key];
            }
        });
    }
    unCheckRadio(event) {
        if (event.target.value === this.armInput.arm_suspended) {
            this.armInput.arm_suspended = '';
        }
    }
    checkboxChange(event, checked) {
        if (checked) {
            this.armInput.arm_type = event.target.value;
        } else {
            this.armInput.arm_type = '';
        }
    }
}
